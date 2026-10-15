export default {
  title: "Cuenta",
  subtitle: "Tus datos de acceso y cómo te contacta Vendora.",
  sections: {
    signIn: "INICIO DE SESIÓN",
    preferences: "PREFERENCIAS",
  },
  rows: {
    email: "CORREO",
    verified: "Verificado",
    password: { label: "Cambiar contraseña", body: "Toca para actualizar" },
    twoStep: { label: "Verificación en dos pasos", body: "Desactivada — recomendada para proveedores" },
    push: { label: "Notificaciones push", body: "Reservas, mensajes, recordatorios" },
  },
  logOut: "Cerrar sesión",
  deleteAccount: "Eliminar cuenta",
  deleteNote: "Al eliminarla, tu cuenta se cierra de inmediato. Tus anuncios, mensajes, reseñas y archivos se borran para siempre después de 30 días, a menos que vuelvas a iniciar sesión y la restaures.",
  password: {
    title: "Cambiar contraseña",
    subtitle: "Al menos 8 caracteres. Elige una que no uses en ningún otro lado.",
    new: "CONTRASEÑA NUEVA",
    confirm: "CONFIRMAR CONTRASEÑA",
    saving: "Guardando…",
    save: "Guardar contraseña",
  },
  dialogs: {
    tooShort: { title: "Contraseña muy corta", message: "Debe tener al menos 8 caracteres." },
    mismatch: { title: "Las contraseñas no coinciden", message: "Vuelve a escribir la contraseña nueva." },
    changeFailed: "No pudimos cambiar la contraseña",
    updated: { title: "Contraseña actualizada", message: "Tu contraseña nueva ya está activa." },
    pushPermission: {
      title: "Se necesita permiso",
      message: "Activa las notificaciones de Vendora en la Configuración de tu dispositivo para recibirlas.",
    },
    twoStep: {
      title: "Verificación en dos pasos",
      message: "Un inicio de sesión más seguro está en camino. Hoy cada inicio de sesión ya usa un código por correo; el interruptor activará la verificación con app de autenticación cuando esté lista.",
    },
    signOut: { title: "Cerrar sesión", message: "¿Seguro que quieres salir?", confirm: "Cerrar sesión" },
    delete: {
      title: "¿Eliminar tu cuenta?",
      message: "Al eliminarla, tu cuenta se cierra ahora y se cierra tu sesión. Si tienes un plan de pago, se cancela de inmediato sin reembolso por el resto del período actual. Todo, incluidos tus anuncios, mensajes y archivos, se borra para siempre después de 30 días. Inicia sesión antes para restaurarla.",
      confirm: "Eliminar cuenta",
    },
    deleteFailed: {
      title: "No pudimos eliminar la cuenta",
      cancelFailed: "No pudimos cancelar tu plan, así que tu cuenta no se eliminó. Inténtalo de nuevo en un momento o escribe a hello@eventvendora.com.",
    },
  },
};
