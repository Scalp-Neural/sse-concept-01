const supabaseUrl = 'https://tmsdshckyohzupgppixh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc2RzaGNreW9oenVwZ3BwaXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjU0MDUsImV4cCI6MjA2MjkwMTQwNX0.etUl3H4GDtgDzXc1seY9z8-kMvKThONWwSOMHtBC_o8'; // свой ключ!
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

function renderUserStat(data, resDiv) {
  resDiv.innerHTML = `
    <b>Ник:</b> ${data.nickname}<br>
    <b>Боев:</b> ${data.battles}<br>
  `;
}

function renderMissionBtn(show, timerSec = 0) {
  const btn = document.getElementById('getMissionBtn');
  if (btn) btn.remove();
  if (show) {
    const missionBtn = document.createElement('button');
    missionBtn.id = 'getMissionBtn';
    missionBtn.innerText = timerSec > 0 ? `БЗ будет доступна через ${timerSec} сек.` : 'Получить боевую задачу!';
    missionBtn.disabled = timerSec > 0;
    document.body.insertBefore(missionBtn, document.getElementById('result').nextSibling);
    if (timerSec === 0) {
      missionBtn.onclick = onGetMission;
    }
  }
}

let mission_battles = null, mission_time = null, promo_code = null, last_battles = null;

document.addEventListener('DOMContentLoaded', async () => {
  const resDiv = document.getElementById('result');
  const nickBlock = document.getElementById('nickBlock');
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.style.display = 'none';

  let { data: row } = await supabase
    .from('user_stats')
    .select('*')
    .eq('tg_id', tgId)
    .maybeSingle();

  if (row) {
    nickBlock.style.display = 'none';
    refreshBtn.style.display = '';
    last_battles = row.battles;
    mission_battles = row.mission_battles;
    mission_time = row.mission_time;
    promo_code = row.promo;
    renderUserStat(row, resDiv);
    await checkMission(row, resDiv, refreshBtn);
  } else {
    nickBlock.style.display = '';
    refreshBtn.style.display = 'none';
  }
});

document.getElementById('saveBtn').onclick = async () => {
  const nick = document.getElementById('nickname').value.trim();
  const resDiv = document.getElementById('result');
  if (!nick) return alert('Введите ник!');

  resDiv.innerHTML = 'Проверяем ник...';
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

    const { error } = await supabase.from('user_stats').insert([
      { tg_id: tgId, nickname: nick, battles }
    ]);
    if (error) {
      resDiv.innerHTML = 'Ошибка сохранения в БД: ' + error.message;
      return;
    }
    renderUserStat({ nickname: nick, battles }, resDiv);
    document.getElementById('nickBlock').style.display = 'none';
    document.getElementById('refreshBtn').style.display = '';
    renderMissionBtn(true);
  } catch (e) {
    resDiv.innerHTML = 'Ошибка при получении статистики!';
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  let { data: row } = await supabase
    .from('user_stats')
    .select('*')
    .eq('tg_id', tgId)
    .maybeSingle();

  if (!row) {
    resDiv.innerHTML = 'Ошибка: не найден пользователь!';
    return;
  }

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

  // Проверяем прирост
  if (row.mission_time && row.mission_battles != null && !row.promo) {
    if (battles > row.mission_battles) {
      // Выдать промокод и обновить
      const promo = generatePromo();
      const promo_time = new Date().toISOString();
      await supabase.from('user_stats').update({
        battles, promo, promo_time
      }).eq('tg_id', tgId);
      renderUserStat({ nickname: row.nickname, battles }, resDiv);
      resDiv.innerHTML += `<br><b>Ваш промокод: <span style="font-size:1.5em">${promo}</span></b>`;
      renderMissionBtn(false);
      renderTimer(row, resDiv, 12*60*60); // 12 часов до новой БЗ
      return;
    }
  }

  // Просто обновляем бои
  await supabase.from('user_stats').update({ battles }).eq('tg_id', tgId);
  renderUserStat({ nickname: row.nickname, battles }, resDiv);
  await checkMission(row, resDiv, document.getElementById('refreshBtn'));
};

async function onGetMission() {
  const resDiv = document.getElementById('result');
  let { data: row } = await supabase
    .from('user_stats')
    .select('*')
    .eq('tg_id', tgId)
    .maybeSingle();

  // Получаем текущее число боёв
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
  const mission_time = new Date().toISOString();
  // Обновляем mission_battles, mission_time, убираем промо
  await supabase.from('user_stats').update({
    mission_battles: battles,
    mission_time,
    promo: null,
    promo_time: null
  }).eq('tg_id', tgId);

  renderUserStat({ nickname: row.nickname, battles }, resDiv);
  resDiv.innerHTML += `<br><b>БЗ получена, сыграйте бой и получите промокод</b>`;
  renderMissionBtn(false);
}

// Генератор промокодов
function generatePromo() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function renderTimer(row, resDiv, secondsLeft) {
  let timer = secondsLeft;
  let interval = setInterval(() => {
    if (timer <= 0) {
      clearInterval(interval);
      renderMissionBtn(true, 0);
      resDiv.innerHTML += '<br><b>БЗ снова доступна!</b>';
    } else {
      let hours = Math.floor(timer/3600), min = Math.floor((timer%3600)/60), sec = timer%60;
      document.getElementById('getMissionBtn')?.innerText = `БЗ будет доступна через ${hours}ч ${min}м ${sec}с`;
      timer--;
    }
  }, 1000);
}

// Проверка состояния БЗ и рендера кнопок
async function checkMission(row, resDiv, refreshBtn) {
  if (!row.mission_time || !row.mission_battles) {
    renderMissionBtn(true, 0);
    return;
  }
  // если промо выдан, ждем 12 часов с promo_time
  if (row.promo && row.promo_time) {
    const now = Date.now();
    const nextMission = new Date(row.promo_time).getTime() + 12*60*60*1000;
    const secLeft = Math.max(0, Math.floor((nextMission - now)/1000));
    renderMissionBtn(false);
    if (secLeft > 0) renderTimer(row, resDiv, secLeft);
    else renderMissionBtn(true, 0);
  } else {
    renderMissionBtn(false);
  }
}
