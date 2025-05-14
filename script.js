// URL ваших Supabase-функций
const API_BASE = 'https://eodmjufamwxcloxxtsm.supabase.co/functions/v1';
const initData = window.Telegram.WebApp.initData;

async function callFn(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw res;
  return res.json();
}

async function setNick(nick) {
  await callFn('set_nick', { initData, nick });
}

async function getStats() {
  const { battles } = await callFn('get_stats', { initData });
  return battles;
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');
  try {
    const battles = await getStats();
    app.innerHTML = `
      <p>👋 Ваши бои: <strong>${battles}</strong></p>
      <button id="refresh">Обновить</button>
    `;
    document.getElementById('refresh').onclick = async () => {
      const b = await getStats();
      document.querySelector('#app strong').textContent = b;
    };
  } catch (err) {
    // Если нет ника (404) или другая ошибка — показываем форму ввода
    app.innerHTML = `
      <p>Введите ваш ник:</p>
      <input id="nick" placeholder="Ник в Мире Кораблей" />
      <button id="save">Сохранить</button>
    `;
    document.getElementById('save').onclick = async () => {
      const nick = document.getElementById('nick').value.trim();
      if (!nick) return alert('Ник не может быть пустым');
      await setNick(nick);
      window.location.reload();
    };
  }
});
