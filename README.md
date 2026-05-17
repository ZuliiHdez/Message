# Orion — Real-Time Messaging Application

**Orion** is a modern, real-time mobile messaging application built for seamless communication. It combines everyday chat functionality with distinctive privacy features and a unique collaborative whiteboard, all wrapped in a clean, customizable interface.

---

## Features

### Messaging
- **Real-time text messaging** — messages are delivered instantly with timestamps
- **Image sharing** — send photos from your gallery with optional captions; images open in a full-screen viewer and can be downloaded
- **Message editing & deletion** — long-press any message to edit or delete it; edited messages are clearly marked
- **Emoji picker** — built-in emoji support in every conversation

### Privacy
- **Photo Bomb (one-time view)** — send an image that can only be viewed once; after the recipient opens it, it is gone forever
- **Contact blocking & removal** — block or unfriend contacts at any time from the Contact Detail page

### Notifications & Alerts
- **Buzz** — send a screen-shake animation with sound to grab someone's attention instantly
- **Push notifications** — receive FCM push notifications for new messages even when the app is in the background

### Groups
- **Group chats** — conversations with multiple participants, with sender names and avatars shown for each message
- **Group management** — add or remove members, assign roles, transfer group ownership, edit group name and photo, and browse shared media

### Collaborative Whiteboard
- **Shared canvas** — accessible directly from the chat toolbar; opens a full-screen drawing space synchronized across all participants in real time
- **Drawing tools** — choose any color via an HSL color picker, select from four brush sizes, and adjust opacity with a smooth slider
- **Eraser tool** — erase strokes naturally, just like a physical eraser on a canvas
- **Clear & share** — clear the board for everyone with one tap, or send a screenshot of the whiteboard directly into the chat as a permanent image

### Customization
- **Light / Dark mode** — toggle themes at any time; every screen adapts instantly
- **Multi-language support** — switch the app language between English, Spanish, French, and German; all text updates immediately

### Account
- **Email & password authentication** — secure login with real-time credential validation and persistent sessions
- **Password recovery** — forgot-password flow via email
- **Profile editing** — update your name, avatar, and other profile details
- **Contact requests** — send and manage friend requests before starting a conversation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Ionic](https://ionicframework.com/) 8 + [Angular](https://angular.dev/) 20 |
| Mobile runtime | [Capacitor](https://capacitorjs.com/) 8 |
| Backend & Realtime | [Supabase](https://supabase.com/) (database, auth, storage, realtime) |
| Push notifications | Firebase Cloud Messaging (FCM) via `@capacitor/push-notifications` |
| Camera / media | `@capacitor/camera` |
| Local notifications | `@capacitor/local-notifications` |
| Language | TypeScript 5.9 |
| Platform | Android (v1.0) |

---

## Project Structure

```
src/
├── app/
│   ├── chat/                 # One-on-one chat page
│   ├── group-chat/           # Group chat page
│   ├── home/                 # Main screen (contact & chat list)
│   ├── contact-detail/       # Contact profile & shared media
│   ├── group-detail/         # Group info & member management
│   ├── add-contact/          # Add contacts by search
│   ├── create-group/         # Group creation flow
│   ├── edit-profile/         # User profile editing
│   ├── settings/             # Theme & language settings
│   ├── requestContact/       # Incoming contact requests
│   ├── components/
│   │   └── whiteboard/       # Real-time collaborative whiteboard
│   ├── services/
│   │   ├── supabase.service  # Supabase client & auth
│   │   ├── chat.service      # Messaging logic
│   │   ├── whiteboard.service# Whiteboard sync via Supabase Realtime
│   │   ├── buzz.service      # Buzz (screen-shake) feature
│   │   ├── friendship.service# Contact & friend request logic
│   │   ├── theme.service     # Light/dark theme management
│   │   └── language.service  # i18n language switching
│   └── userlogin/
│       ├── login/
│       ├── register/
│       ├── forgot-password/
│       └── reset-password/
android/                      # Native Android project (Capacitor)
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Angular CLI](https://angular.dev/tools/cli) 20
- [Ionic CLI](https://ionicframework.com/docs/cli) — `npm install -g @ionic/cli`
- [Android Studio](https://developer.android.com/studio) (for Android builds)
- A [Supabase](https://supabase.com/) project with the required tables and storage buckets
- A Firebase project with FCM configured

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd orion

# Install dependencies
npm install
```

### Configuration

Create a Supabase project and add your credentials to the Supabase service. Configure your Firebase `google-services.json` inside `android/app/`.

### Run in the browser

```bash
npm start
```

### Build & run on Android

```bash
npm run build
npx cap sync android
npx cap open android
```

Then build and run from Android Studio, or use `npx cap run android` with a connected device.

---

## Release

**v1.0** — Initial release for Android.

Includes all core messaging features, Photo Bomb, Buzz, group chats, the collaborative whiteboard, push notifications, and multi-language support.

---

## License

This project is private and not licensed for public distribution.
