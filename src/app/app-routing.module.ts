import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
{
  path: 'home',
  loadComponent: () => import('./home/home.page').then(m => m.HomePage)
},
  {
    path: 'login',
    loadComponent: () =>
    import('./userlogin/login/login.page').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () =>
    import('./userlogin/register/register.page').then(m => m.RegisterComponent)
  },
  {
  path: 'forgot-password',
  loadComponent: () =>
    import('./userlogin/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage)
},
{
  path: 'reset-password',
  loadComponent: () =>
    import('./userlogin//reset-password/reset-password.page').then(m => m.ResetPasswordPage)
},
  {
    path: 'chat',
    loadComponent: () => import('./chat/chat.page').then(m => m.ChatPage)
  },
  {
    path: 'add-contact',
    loadComponent: () => import('./add-contact/add-contact.page').then(m => m.AddContactPage)
  },
  {
    path: 'peticiones',
    loadComponent: () => import('./peticiones/peticiones.page').then(m => m.PeticionesPage)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
