export default {
  title: "Account",
  subtitle: "Sign-in details and how Vendora reaches you.",
  sections: {
    signIn: "SIGN IN",
    preferences: "PREFERENCES",
  },
  rows: {
    email: "EMAIL",
    verified: "Verified",
    password: { label: "Change password", body: "Tap to update" },
    twoStep: { label: "Two-step verification", body: "Off — recommended for vendors" },
    push: { label: "Push notifications", body: "Bookings, messages, reminders" },
  },
  logOut: "Log out",
  deleteAccount: "Delete account",
  deleteNote: "Deleting closes your account right away. Your listings, messages, reviews and files are permanently deleted after 30 days unless you sign back in and restore it.",
  password: {
    title: "Change password",
    subtitle: "At least 8 characters. Pick something you don't use anywhere else.",
    new: "NEW PASSWORD",
    confirm: "CONFIRM PASSWORD",
    saving: "Saving…",
    save: "Save password",
  },
  dialogs: {
    tooShort: { title: "Password too short", message: "Must be at least 8 characters." },
    mismatch: { title: "Passwords don't match", message: "Please re-type the new password." },
    changeFailed: "Couldn't change password",
    updated: { title: "Password updated", message: "Your new password is active." },
    pushPermission: {
      title: "Push permission needed",
      message: "Enable notifications for Vendora in your device Settings to receive pushes.",
    },
    twoStep: {
      title: "Two-step verification",
      message: "Stronger sign-in is on the roadmap. Today every login already uses an email-code check; the toggle will switch to authenticator-app 2FA when it ships.",
    },
    signOut: { title: "Sign out", message: "Are you sure?", confirm: "Sign out" },
    delete: {
      title: "Delete your account?",
      message: "Deleting closes your account now and signs you out. If you have a paid plan, it's canceled right away with no refund for the rest of the current billing period. Everything, including your listings, messages and uploaded files, is permanently deleted after 30 days. Sign in before then to restore it.",
      confirm: "Delete account",
    },
    deleteFailed: {
      title: "Couldn't delete account",
      cancelFailed: "We couldn't cancel your plan, so your account wasn't deleted. Try again in a moment, or email hello@eventvendora.com.",
    },
  },
};
