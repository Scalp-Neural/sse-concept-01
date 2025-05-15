// Выводим, что реально доступно
console.log("Telegram:", window.Telegram);
console.log("Telegram.WebApp:", window.Telegram?.WebApp);
console.log("Telegram.WebApp.initData:", window.Telegram?.WebApp?.initData);

// Проверка, что объект Telegram вообще есть
window.addEventListener('DOMContentLoaded', () => {
  let info = '';
  if (window.Telegram) {
    info += 'window.Telegram exists!\n';
    if (window.Telegram.WebApp) {
      info += 'window.Telegram.WebApp exists!\n';
      info += 'initData: ' + (window.Telegram.WebApp.initData || 'undefined') + '\n';
    } else {
      info += 'window.Telegram.WebApp is undefined\n';
    }
  } else {
    info += 'window.Telegram is undefined\n';
  }
  console.log(info);
});

// --- Отправка ника и initData боту по кнопке ---
document.getElementById('sendToBotBtn').onclick = () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.sendData) {
    // Передаём и ник, и всю initData!
    window.Telegram.WebApp.sendData(JSON.stringify({
      nickname: nick,
      initData: window.Telegram.WebApp.initData
    }));
    alert('Данные отправлены боту!');
  } else {
    alert('WebApp API Telegram недоступен');
  }
};

// --- LocalStorage, удобство для пользователя ---
function getTgId() {
  // Тут мы просто для localStorage, НЕ для проверки пользователя!
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
    const params = new URLSearchParams(window.Telegram.WebApp.initData);
    const user = params.get('user');
    if (user) {
      try {
        return JSON.parse(user).id;
      } catch (e) { }
    }
  }
  return 'test_id'; // fallback для локального теста
}
const tgId = getTgId();

const savedNick = localStorage.getItem(`mk_nick_${tgId}`);
if (savedNick) document.getElementById('nickname').value = savedNick;

document.getElementById('saveBtn').onclick = () => {
  const nick = document.getElementById('nickname').value.trim();
  if (!nick) return alert('Введите ник!');
  localStorage.setItem(`mk_nick_${tgId}`, nick);
  alert(`Никнейм сохранён для TG ID: ${tgId}`);
};

// --- Показ статистики, не относится к Telegram API ---
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
