const supabaseUrl = 'https://tmsdshckyohzupgppixh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc2RzaGNreW9oenVwZ3BwaXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjU0MDUsImV4cCI6MjA2MjkwMTQwNX0.etUl3H4GDtgDzXc1seY9z8-kMvKThONWwSOMHtBC_o8';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

function getTgId() {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
    const params = new URLSearchParams(window.Telegram.WebApp.initData);
    const user = params.get('user');
    if (user) {
      try { return JSON.parse(user).id; } catch (e) {}
    }
  }
  return 'test_id';
}
const tgId = getTgId();

// При загрузке страницы — ищем юзера по TG ID
document.addEventListener('DOMContentLoaded', async () => {
  const resDiv = document.getElementById('result');
  const nickBlock = document.getElementById('nickBlock');
  const refreshBtn = document.getElementById('refreshBtn');

  let { data: row } = await supabase
    .from('user_stats')
    .select('*')
    .eq('tg_id', tgId)
    .maybeSingle();

  if (row) {
    // Если пользователь есть, скрываем ввод и показываем кнопку "Обновить"
    nickBlock.style.display = 'none';
    refreshBtn.style.display = '';
    renderUserStat(row, resDiv);
  } else {
    // Нет записи — показываем ввод и скрываем "Обновить"
    nickBlock.style.display = '';
    refreshBtn.style.display = 'none';
  }
});

// Сохранить ник (только если не было записи)
document.getElementById('saveBtn').onclick = async () => {
  const nick = document.getElementById('nickname').value.trim();
  const resDiv = document.getElementById('result');
  if (!nick) return alert('Введите ник!');

  resDiv.innerHTML = 'Проверяем ник...';
  // Проверяем ник через API Мир Кораблей
  try {
    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(nick)}`);
    const listData = await listResp.json();
    if (!listData.data.length) {
      resDiv.innerHTML = 'Ник не найден!';
      return;
    }
    const accountId = listData.data[0].account_id;
    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    const statData = await statResp.json();
    const userData = statData.data[accountId];
    const battles = userData.statistics.battles ?? userData.statistics.pvp?.battles;
    const updated_at = new Date().toISOString();

    // Пишем в БД только если записи не было!
    const { error } = await supabase.from('user_stats').insert([
      { tg_id: tgId, nickname: nick, battles, updated_at }
    ]);
    if (error) {
      resDiv.innerHTML = 'Ошибка сохранения в БД: ' + error.message;
      return;
    }
    renderUserStat({ nickname: nick, battles, updated_at, tg_id: tgId }, resDiv);
    document.getElementById('nickBlock').style.display = 'none';
    document.getElementById('refreshBtn').style.display = '';
  } catch (e) {
    resDiv.innerHTML = 'Ошибка при получении статистики!';
  }
};

// Обновить (тянет стату по своему нику, обновляет только свои данные)
document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  // Находим свой ник по TG ID
  let { data: row, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('tg_id', tgId)
    .maybeSingle();

  if (!row) {
    resDiv.innerHTML = 'Ошибка: не найден пользователь!';
    return;
  }

  // Получаем обновлённую стату по своему нику
  try {
    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}`);
    const listData = await listResp.json();
    if (!listData.data.length) {
      resDiv.innerHTML = 'Ник не найден!';
      return;
    }
    const accountId = listData.data[0].account_id;
    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    const statData = await statResp.json();
    const userData = statData.data[accountId];
    const battles = userData.statistics.battles ?? userData.statistics.pvp?.battles;
    const updated_at = new Date().toISOString();

    // Обновляем в БД
    await supabase.from('user_stats').update({ battles, updated_at }).eq('tg_id', tgId);

    renderUserStat({ nickname: row.nickname, battles, updated_at, tg_id: tgId }, resDiv);
  } catch (e) {
    resDiv.innerHTML = 'Ошибка при обновлении статистики!';
  }
};

function renderUserStat(data, resDiv) {
  resDiv.innerHTML = `
    <b>Ник:</b> ${data.nickname}<br>
    <b>Боев:</b> ${data.battles}<br>
    <b>Время:</b> ${data.updated_at}<br>
    <small>TG ID: ${data.tg_id}</small>
  `;
}
