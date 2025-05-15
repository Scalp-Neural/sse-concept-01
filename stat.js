console.log("Telegram:", window.Telegram);
console.log("Telegram.WebApp:", window.Telegram?.WebApp);
console.log("Telegram.WebApp.initDataUnsafe:", window.Telegram?.WebApp?.initDataUnsafe);

window.addEventListener('DOMContentLoaded', () => {
  let info = '';
  if (window.Telegram) {
    info += 'window.Telegram exists!\n';
    if (window.Telegram.WebApp) {
      info += 'window.Telegram.WebApp exists!\n';
      info += 'initData: ' + (window.Telegram.WebApp.initData || 'undefined') + '\n';
      info += 'initDataUnsafe: ' + JSON.stringify(window.Telegram.WebApp.initDataUnsafe) + '\n';
    } else {
      info += 'window.Telegram.WebApp is undefined\n';
    }
  } else {
    info += 'window.Telegram is undefined\n';
  }
  alert(info);
  console.log(info);
});

// --- ... (остальной код остается прежним) ---

// Новая функция для отправки данных в Telegram боту
document.getElementById('sendToBotBtn').onclick = () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.sendData) {
    window.Telegram.WebApp.sendData(JSON.stringify({ nickname: nick }));
    alert('Данные отправлены боту!');
  } else {
    alert('WebApp API Telegram недоступен');
  }
};


// Функция для получения TG ID (только в Telegram WebApp!)
// Для отладки на github pages добавь fallback на 'test_id'
function getTgId() {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe.user) {
    return window.Telegram.WebApp.initDataUnsafe.user.id;
  }
  return 'test_id'; // для локальной отладки
}

const tgId = getTgId();

// Попробуй загрузить никнейм из localStorage (ключ зависит от TG ID)
const savedNick = localStorage.getItem(`mk_nick_${tgId}`);
if (savedNick) document.getElementById('nickname').value = savedNick;

// Сохраняем никнейм и TG ID в localStorage
document.getElementById('saveBtn').onclick = () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  localStorage.setItem(`mk_nick_${tgId}`, nick);
  alert(`Никнейм сохранён для TG ID: ${tgId}`);
};

// Запрашиваем и показываем статистику (как раньше)
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
    resDiv.innerHTML = `<b>${userData.nickname}:</b> боёв <b>${battles}</b><br><br><small>TG ID: ${tgId}</small>`;
  } catch (e) {
    resDiv.innerHTML = 'Ошибка при загрузке!';
  }
};
