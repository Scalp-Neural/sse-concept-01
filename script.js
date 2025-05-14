// URL ваших Supabase-функций
const API_BASE = 'https://eodmjufamwxcloxxtsm.supabase.co/functions/v1';

// Утилита для вызова функции
async function callFn(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw res;
  return res.json();
}

// Основная логика после полной загрузки страницы
window.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');

  // Проверяем, что мы в WebApp-контексте Telegram
  if (!window.Telegram?.WebApp) {
    app.textContent = '❌ Ошибка: Telegram WebApp API не найден';
    return;
  }

  const tg       = window.Telegram.WebApp;
  const initData = tg.initData;  // теперь безопасно

  // Функции, зависящие от initData
  const setNick = async (nick) => {
    await callFn('set_nick', { initData, nick });
  };
  const getStats = async () => {
    const { battles } = await callFn('get_stats', { initData });
    return battles;
  };

  // Пробуем сразу получить stats
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
    // Если упало (404 — нет ника, или любая другая ошибка) — показываем форму
    app.innerHTML = `
      <p>Введите ваш ник:</p>
      <input id="nick" placeholder="Ник в Мире Кораблей" />
      <button id="save">Сохранить</button>
    `;
    document.getElementById('save').onclick = async () => {
      const nick = document.getElementById('nick').value.trim();
      if (!nick) return alert('Ник не может быть пустым');
      try {
        await setNick(nick);
        window.location.reload();
      } catch {
        alert('Не удалось сохранить ник — проверьте консоль');
      }
    };
  }
});
