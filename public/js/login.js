document.addEventListener('DOMContentLoaded', () => {
  if (window.PackingApi.isAuthenticated()) {
    window.location.replace('/dashboard');
    return;
  }

  const form = document.getElementById('login-form');
  const errorNode = document.getElementById('login-error');
  const submit = document.getElementById('login-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNode.classList.add('hidden');
    errorNode.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Entrando…';

    const codigo = document.getElementById('codigo').value.trim();
    const contrasena = document.getElementById('contrasena').value;

    try {
      const result = await window.PackingApi.login(codigo, contrasena);
      if (!result.ok) {
        errorNode.textContent = result.error === 'invalid_credentials'
          ? 'Código o contraseña incorrectos.'
          : 'No se pudo iniciar sesión.';
        errorNode.classList.remove('hidden');
        window.PackingToast.toast('Acceso denegado', 'error');
        return;
      }

      window.PackingToast.toast('Sesión iniciada');
      window.location.assign('/dashboard');
    } catch {
      errorNode.textContent = 'Error de red al contactar la API.';
      errorNode.classList.remove('hidden');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  });
});
