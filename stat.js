// Supabase настройки
const supabaseUrl = 'https://tmsdshckyohzupgppixh.supabase.co'; // твой Project URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc2RzaGNreW9oenVwZ3BwaXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjU0MDUsImV4cCI6MjA2MjkwMTQwNX0.etUl3H4GDtgDzXc1seY9z8-kMvKThONWwSOMHtBC_o8';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Локальный TG ID (используется для localStorage)
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

// Автозаполнение ника из localStorage
const savedNick = localStorage.getItem(`mk_nick_${tgId}`);
if (savedNick) document.getElementById('nickname').value = savedNick;

// Сохранить никнейм в localStorage
document.getElementById('saveBtn').onclick = () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  localStorage.setItem(`mk_nick_${tgId}`, nick);
  alert(`Никнейм сохранён для TG ID: ${tgId}`);
};

// Отправка данных WebApp боту
document.getElementById('sendToBotBtn').onclick = () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.sendData) {
    window.Telegram.WebApp.sendData(JSON.stringify({
      nickname: nick,
      initData: window.Telegram.WebApp.initData
    }));
    alert('Данные отправлены боту!');
  } else {
    alert('WebApp API Telegram недоступен');
  }
};

// Показываем статистику по нику
document.getElementById('showStatBtn').onclick = async () => {
  const nick = localStorage.getItem(`mk_nick_${tgId}`) || document.getElementById('nickname').value.trim();
  const resDiv = document.getElementById('result');
  if (!nick) return alert('Сначала сохраните ник!');

  resDiv.innerHTML = 'Загружаем...';
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
    window.currentBattles = battles; // для Supabase

    resDiv.innerHTML = `<b>${userData.nickname}:</b> боёв <b>${battles}</b><br><br><small>TG ID: ${tgId}</small>`;
  } catch (e) {
    resDiv.innerHTML = 'Ошибка при загрузке!';
  }
};

// Сохраняем данные в Supabase
document.getElementById('saveToSupabaseBtn').onclick = async () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  const battles = window.currentBattles || 0;
  const updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('user_stats').upsert([
    { tg_id, nickname: nick, battles, updated_at }
  ], { onConflict: ['tg_id'] });

  if (error) {
    alert('Ошибка при сохранении в БД: ' + error.message);
  } else {
    alert('Данные сохранены в Supabase!');
  }
};
