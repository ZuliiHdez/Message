import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef, Input, Output, EventEmitter, NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController } from '@ionic/angular';
import { WhiteboardService, WhiteboardStroke } from '../../services/whiteboard.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-whiteboard',
  templateUrl: './whiteboard.component.html',
  styleUrls: ['./whiteboard.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class WhiteboardComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() chatId!: string;
  @Input() myId!: string;

  @Output() screenshotReady = new EventEmitter<File>();
  @Output() closed = new EventEmitter<void>();

  readonly widths = [3, 6, 12, 24];
  readonly presetColors = [
    '#111111', '#ffffff', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#06b6d4', '#8b5cf6',
  ];

  selectedColor   = '#111111';
  selectedWidth   = 4;
  selectedOpacity = 1.0;
  selectedTool: 'pen' | 'eraser' = 'pen';

  // Color picker panel
  showColorPicker = false;
  cpHue        = 0;
  cpSaturation = 0;
  cpLightness  = 7;

  private get drawColor(): string {
    return this.selectedTool === 'eraser' ? '#ffffff' : this.selectedColor;
  }

  toggleColorPicker() {
    this.showColorPicker = !this.showColorPicker;
    if (this.showColorPicker) {
      this.selectedTool = 'pen';
      const hsl = this.hexToHsl(this.selectedColor);
      this.cpHue        = hsl.h;
      this.cpSaturation = hsl.s;
      this.cpLightness  = hsl.l;
    }
  }

  closeColorPicker() {
    this.showColorPicker = false;
  }

  onCpChange() {
    this.selectedColor = this.hslToHex(this.cpHue, this.cpSaturation, this.cpLightness);
  }

  applyPreset(color: string) {
    this.selectedColor = color;
    const hsl = this.hexToHsl(color);
    this.cpHue        = hsl.h;
    this.cpSaturation = hsl.s;
    this.cpLightness  = hsl.l;
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = (s / 100) * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  private hexToHsl(hex: string): { h: number; s: number; l: number } {
    const full = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const r = parseInt(full.slice(1, 3), 16) / 255;
    const g = parseInt(full.slice(3, 5), 16) / 255;
    const b = parseInt(full.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l   = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  loading = false;
  sending = false;

  private ctx!: CanvasRenderingContext2D;
  private committedImageData!: ImageData;
  private isDrawing = false;
  private currentPoints: Array<{ x: number; y: number }> = [];
  private channel: any = null;

  constructor(
    private wbService: WhiteboardService,
    private alertCtrl: AlertController,
    public lang: LanguageService,
    private zone: NgZone,
  ) {}

  ngOnInit() {
    this.channel = this.wbService.subscribe(
      this.chatId,
      (stroke) => {
        if (stroke.user_id === this.myId) return;
        this.zone.run(() => this.applyRemoteStroke(stroke));
      },
      () => this.zone.run(() => this.resetCanvas()),
    );
  }

  async ngAfterViewInit() {
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    this.initCanvas();
    await this.loadStrokes();
  }

  ngOnDestroy() {
    this.wbService.removeChannel(this.channel);
  }

  // ── Canvas init ──────────────────────

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    const wrap   = canvas.parentElement!;
    canvas.width  = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
    this.ctx = canvas.getContext('2d')!;
    this.fillWhite();
    this.saveCommitted();
  }

  private fillWhite() {
    const c = this.canvasRef.nativeElement;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, c.width, c.height);
  }

  private saveCommitted() {
    const c = this.canvasRef.nativeElement;
    this.committedImageData = this.ctx.getImageData(0, 0, c.width, c.height);
  }

  private resetCanvas() {
    this.fillWhite();
    this.saveCommitted();
  }

  // ── Load existing strokes ────────────

  private async loadStrokes() {
    this.loading = true;
    try {
      const strokes = await this.wbService.loadStrokes(this.chatId);
      for (const s of strokes) this.applyStrokeToCommitted(s);
      this.ctx.putImageData(this.committedImageData, 0, 0);
    } catch (e) {
      console.error('Error loading whiteboard:', e);
    }
    this.loading = false;
  }

  // ── Pointer events ───────────────────

  onPointerDown(e: PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.isDrawing = true;
    this.currentPoints = [this.getPos(e)];
  }

  onPointerMove(e: PointerEvent) {
    if (!this.isDrawing) return;
    e.preventDefault();
    this.currentPoints.push(this.getPos(e));
    this.ctx.putImageData(this.committedImageData, 0, 0);
    this.drawPath(this.ctx, this.currentPoints, this.drawColor, this.selectedWidth, this.selectedOpacity);
  }

  async onPointerUp(e: PointerEvent) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentPoints.length === 1) {
      this.currentPoints.push({ ...this.currentPoints[0] });
    }
    if (this.currentPoints.length < 2) {
      this.currentPoints = [];
      return;
    }

    this.saveCommitted();
    const stroke: WhiteboardStroke = {
      chat_id: this.chatId,
      points:  this.currentPoints,
      color:   this.drawColor,
      width:   this.selectedWidth,
      opacity: this.selectedOpacity,
      tool:    'pen',
    };
    this.currentPoints = [];
    try {
      await this.wbService.saveStroke(stroke);
    } catch (e) {
      console.error('Error saving stroke:', e);
    }
  }

  // ── Remote strokes ───────────────────

  private applyRemoteStroke(stroke: WhiteboardStroke) {
    this.applyStrokeToCommitted(stroke);
    if (this.isDrawing) {
      this.ctx.putImageData(this.committedImageData, 0, 0);
      this.drawPath(this.ctx, this.currentPoints, this.drawColor, this.selectedWidth, this.selectedOpacity);
    } else {
      this.ctx.putImageData(this.committedImageData, 0, 0);
    }
  }

  private applyStrokeToCommitted(stroke: WhiteboardStroke) {
    const canvas = this.canvasRef.nativeElement;
    const tmp = document.createElement('canvas');
    tmp.width  = canvas.width;
    tmp.height = canvas.height;
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.putImageData(this.committedImageData, 0, 0);
    this.drawPath(tmpCtx, stroke.points, stroke.color, stroke.width, stroke.opacity);
    this.committedImageData = tmpCtx.getImageData(0, 0, canvas.width, canvas.height);
  }

  // ── Draw ─────────────────────────────

  private drawPath(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    color: string, width: number, opacity: number,
  ) {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
    ctx.restore();
  }

  private getPos(e: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  // ── Actions ──────────────────────────

  setTool(tool: 'pen' | 'eraser') {
    this.selectedTool = tool;
  }

  async confirmClear() {
    const alert = await this.alertCtrl.create({
      header:   this.lang.t('wb_clear_title'),
      message:  this.lang.t('wb_clear_msg'),
      cssClass: 'orion-alert',
      buttons: [
        { text: this.lang.t('chat_cancel'), role: 'cancel' },
        {
          text: this.lang.t('wb_clear_btn'),
          role: 'destructive',
          cssClass: 'alert-danger-btn',
          handler: async () => {
            try {
              await this.wbService.clearStrokes(this.chatId, this.channel);
              this.resetCanvas();
            } catch (e) {
              console.error('Error clearing whiteboard:', e);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async sendScreenshot() {
    if (this.sending) return;
    this.sending = true;
    try {
      const dataUrl = this.canvasRef.nativeElement.toDataURL('image/png');
      const blob    = await (await fetch(dataUrl)).blob();
      const file    = new File([blob], `whiteboard-${Date.now()}.png`, { type: 'image/png' });
      this.screenshotReady.emit(file);
    } catch (e) {
      console.error('Error creating screenshot:', e);
    }
    this.sending = false;
  }

  close() {
    this.closed.emit();
  }
}
