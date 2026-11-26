# Firebase setup (Phase 11)

1. Create a Firebase project and enable **Authentication → Google** and **Firestore**.
2. Copy `.env.example` to `.env.local` in `linglink/` and paste Web app config values.
3. Set `VITE_REPOSITORY_MODE=firebase`.
4. Deploy rules: `firebase deploy --only firestore:rules` (from repo root with `firebase.json` pointing at `firestore.rules`).
5. Seed catalog: import words/topics/texts from mock seed into Firestore collections (manual script or console — automated seed script is post-MVP).

Mock mode remains the default when env vars are absent or `VITE_REPOSITORY_MODE=mock`.
