const supabaseUrl = 'https://tmsdshckyohzupgppixh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc2RzaGNreW9oenVwZ3BwaXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjU0MDUsImV4cCI6MjA2MjkwMTQwNX0.etUl3H4GDtgDzXc1seY9z8-kMvKThONWwSOMHtBC_o8';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

function getTgId() {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
    const params = new URLSearchParams(window.Telegram.WebApp.initData);
    const user = params.get('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        return userData.id;
      } catch (e) {
        console.error("Ошибка парсинга user data из Telegram:", e);
      }
    }
  }
  // console.warn(" Используется тестовый tgId. Убедитесь, что приложение запущено в Telegram для получения реального ID.");
  return 'test_id'; // Для тестирования вне Telegram
}
const tgId = getTgId();

let activeTimerInterval = null;

function renderUserStat(data, resDiv) {
  // Очищаем предыдущее сообщение о БЗ или ошибке перед рендером основной статы
  let baseContent = `<b>Ник:</b> ${data.nickname || 'N/A'}<br><b>Боев:</b> ${data.battles != null ? data.battles : 'N/A'}<br>`;
  resDiv.innerHTML = baseContent; // Сначала базовая инфа
  return baseContent; // Возвращаем базовый контент для возможного использования в checkMission
}


function renderMissionBtn(show, timerSec = 0) {
  const btnBox = document.getElementById('missionBtnBox');
  if (!btnBox) {
    console.error("Элемент #missionBtnBox не найден!");
    return;
  }
  btnBox.innerHTML = ''; // Очищаем контейнер
  if (show) {
    const missionBtn = document.createElement('button');
    missionBtn.id = 'getMissionBtn';
    missionBtn.innerText = timerSec > 0 ? `БЗ будет доступна через ${timerSec} сек.` : 'Получить боевую задачу!';
    missionBtn.disabled = timerSec > 0;
    btnBox.appendChild(missionBtn);
    if (timerSec === 0) {
      missionBtn.onclick = onGetMission;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const resDiv = document.getElementById('result');
  const nickBlock = document.getElementById('nickBlock');
  const refreshBtn = document.getElementById('refreshBtn');
  const promoDiv = document.getElementById('promo');

  if (!resDiv || !nickBlock || !refreshBtn || !promoDiv) {
    console.error("Один или несколько ключевых HTML элементов не найдены!");
    resDiv.innerHTML = '<span class="error-message">Ошибка инициализации интерфейса. Обновите.</span>';
    return;
  }

  refreshBtn.style.display = 'none';
  promoDiv.innerHTML = '';

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError) {
      console.error("Ошибка получения данных пользователя из Supabase:", fetchError);
      resDiv.innerHTML = '<span class="error-message">Не удалось загрузить данные. Попробуйте позже.</span>';
      return;
    }

    if (row) {
      nickBlock.style.display = 'none';
      refreshBtn.style.display = '';
      const baseContent = renderUserStat(row, resDiv);
      await checkMission(row, resDiv, refreshBtn, baseContent);
    } else {
      nickBlock.style.display = '';
      refreshBtn.style.display = 'none';
      resDiv.innerHTML = 'Пожалуйста, введите ваш никнейм для начала.';
    }
  } catch (e) {
    console.error("Общая ошибка в DOMContentLoaded:", e);
    resDiv.innerHTML = '<span class="error-message">Непредвиденная ошибка при загрузке.</span>';
  }
});

document.getElementById('saveBtn').onclick = async () => {
  const nickInput = document.getElementById('nickname');
  const nick = nickInput.value.trim();
  const resDiv = document.getElementById('result');
  const nickBlock = document.getElementById('nickBlock');
  const refreshBtn = document.getElementById('refreshBtn');

  if (!nick) {
    alert('Введите ник!');
    return;
  }

  resDiv.innerHTML = 'Проверяем ник...';
  try {
    // 1. Проверяем, не занят ли этот никнейм ДРУГИМ tg_id в нашей базе
    let { data: existingUserWithNick, error: nickCheckError } = await supabase
      .from('user_stats')
      .select('tg_id')
      .eq('nickname', nick)
      .not('tg_id', 'eq', tgId)
      .maybeSingle();

    if (nickCheckError) {
      console.error("Ошибка проверки уникальности ника в Supabase:", nickCheckError);
      resDiv.innerHTML = '<span class="error-message">Ошибка при проверке ника в базе. Попробуйте позже.</span>';
      return;
    }

    if (existingUserWithNick) {
      resDiv.innerHTML = '<span class="warning-message">Имя аккаунта уже используется другим пользователем. Пожалуйста, введите свой никнейм.</span>';
      return;
    }

    // 2. Если ник свободен, продолжаем проверку в API korabli.su
    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(nick)}`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || !listData.data.length) {
      resDiv.innerHTML = '<span class="warning-message">Ник не найден в игре!</span>';
      return;
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) {
      resDiv.innerHTML = '<span class="warning-message">Не удалось получить статистику для ника.</span>';
      return;
    }
    const userData = statData.data[accountId];
    if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      resDiv.innerHTML = '<span class="error-message">Ошибка: не найдено количество боев в статистике!</span>';
      return;
    }
    const battles = userData.statistics.battles ?? userData.statistics.pvp?.battles;

    const newUserRecord = { tg_id: tgId, nickname: nick, battles: battles, mission_battles: null, mission_time: null, promo: null, promo_time: null };
    const { error: upsertError } = await supabase.from('user_stats').upsert(newUserRecord, { onConflict: 'tg_id' });

    if (upsertError) {
      console.error("Ошибка сохранения в БД (upsert):", upsertError);
      resDiv.innerHTML = '<span class="error-message">Ошибка сохранения в БД: ' + upsertError.message + '</span>';
      return;
    }

    const baseContent = renderUserStat(newUserRecord, resDiv);
    nickBlock.style.display = 'none';
    refreshBtn.style.display = '';
    document.getElementById('promo').innerHTML = '';
    await checkMission(newUserRecord, resDiv, refreshBtn, baseContent);

  } catch (e) {
    console.error("Ошибка при сохранении/проверке ника:", e);
    resDiv.innerHTML = `<span class="error-message">Ошибка: ${e.message || 'Произошла ошибка при получении статистики!'}</span>`;
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  // const promoDiv = document.getElementById('promo'); // promoDiv управляется в checkMission

  // Сохраняем текущее содержимое resDiv, чтобы добавить к нему сообщение об обновлении, если нужно
  // или перезаписать в случае ошибки
  let statusMessage = document.createElement('span');
  statusMessage.style.fontSize = '0.9em';
  statusMessage.style.color = '#aaa';
  statusMessage.innerText = '\nОбновление данных...';
  resDiv.appendChild(statusMessage);


  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для обновления или пользователь не найден:", fetchError);
      renderUserStat({}, resDiv); // Очистить старые данные
      resDiv.innerHTML += '<br><span class="error-message">Ошибка: не найден пользователь для обновления!</span>';
      return;
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || !listData.data.length) {
      renderUserStat(row, resDiv); // Показать старые данные
      resDiv.innerHTML += `<br><span class="warning-message">Ник ${row.nickname} не найден в игре при обновлении!</span>`;
      return;
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) {
      renderUserStat(row, resDiv);
      resDiv.innerHTML += '<br><span class="warning-message">Не удалось получить статистику для обновления.</span>';
      return;
    }
    const userData = statData.data[accountId];
     if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      renderUserStat(row, resDiv);
      resDiv.innerHTML += '<br><span class="error-message">Ошибка: не найдено количество боев в статистике для обновления!</span>';
      return;
    }
    const currentBattles = userData.statistics.battles ?? userData.statistics.pvp?.battles;
    
    let updatePayload = { battles: currentBattles };

    if (row.mission_time && row.mission_battles != null && !row.promo) {
      if (currentBattles > row.mission_battles) {
        const promoCode = generatePromo();
        const promoTime = new Date().toISOString();
        
        Object.assign(updatePayload, {
          promo: promoCode,
          promo_time: promoTime,
          mission_time: null,
          mission_battles: null
        });
        
        row.promo = promoCode;
        row.promo_time = promoTime;
        row.mission_time = null;
        row.mission_battles = null;
      }
    }
    
    row.battles = currentBattles; // Обновляем бои в локальном объекте row в любом случае

    const { error: updateError } = await supabase.from('user_stats').update(updatePayload).eq('tg_id', tgId);
    if (updateError) throw updateError;

    const baseContent = renderUserStat(row, resDiv);
    await checkMission(row, resDiv, document.getElementById('refreshBtn'), baseContent);

  } catch (e) {
    console.error("Ошибка при обновлении статистики:", e);
    // resDiv.innerHTML уже содержит предыдущую статистику, добавим ошибку
    let { data: currentRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle(); // Попытка получить актуальные данные
    const base = renderUserStat(currentRow || { nickname: 'N/A', battles: 'N/A'}, resDiv);
    resDiv.innerHTML = base + `<br><span class="error-message">Ошибка обновления: ${e.message || 'Неизвестная ошибка'}</span>`;
  }
};

async function onGetMission() {
  const resDiv = document.getElementById('result');
  resDiv.innerHTML += '\nПолучаем боевую задачу...';


  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('nickname, battles, mission_battles, mission_time, promo, promo_time') // Запрашиваем все нужные поля
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для БЗ:", fetchError);
      renderUserStat(row || {}, resDiv);
      resDiv.innerHTML += '<br><span class="error-message">Ошибка: не найден пользователь для получения БЗ!</span>';
      return;
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();
    if (listData.status === 'error' || !listData.data || !listData.data.length) throw new Error(`Ник ${row.nickname} не найден при получении БЗ`);
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();
    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) throw new Error('Не удалось получить статистику для БЗ');
    const userData = statData.data[accountId];

    if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
       throw new Error('Не найдено количество боев в статистике для БЗ!');
    }
    const currentBattlesForMission = userData.statistics.battles ?? userData.statistics.pvp?.battles;
    const missionTime = new Date().toISOString();

    const missionUpdate = {
      mission_battles: currentBattlesForMission,
      mission_time: missionTime,
      battles: currentBattlesForMission,
      promo: null,
      promo_time: null
    };
    const { error: updateError } = await supabase.from('user_stats').update(missionUpdate).eq('tg_id', tgId);
    if (updateError) throw updateError;

    // Обновляем локальный объект row для отображения
    row.battles = currentBattlesForMission;
    row.mission_battles = currentBattlesForMission;
    row.mission_time = missionTime;
    row.promo = null;
    row.promo_time = null;

    const baseContent = renderUserStat(row, resDiv);
    await checkMission(row, resDiv, document.getElementById('refreshBtn'), baseContent);

  } catch (e) {
    console.error("Ошибка в onGetMission:", e);
    let { data: currentRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle();
    const base = renderUserStat(currentRow || { nickname: 'N/A', battles: 'N/A'}, resDiv);
    resDiv.innerHTML = base + `<br><span class="error-message">Ошибка получения БЗ: ${e.message || 'Неизвестная ошибка'}</span>`;
  }
}

function generatePromo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function renderTimer(row, resDiv, secondsLeft) {
  const promoDiv = document.getElementById('promo');
  const promoCodeText = row.promo ? `<b>${row.promo}</b>` : ''; // Только код, текст "Ваш промокод" добавим ниже

  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
  }
  let timer = Math.max(0, secondsLeft);
  renderMissionBtn(false); // Скрываем кнопку "Получить БЗ"

  const updateTimerDisplay = () => {
    let promoContent = '';
    if (row.promo) {
        promoContent += `Ваш промокод: ${promoCodeText}<br>`;
    }

    if (timer <= 0) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      renderMissionBtn(true, 0);
      if (promoDiv) {
        promoDiv.innerHTML = promoContent + 'Боевая задача снова доступна!';
      }
    } else {
      let hours = Math.floor(timer / 3600);
      let minutes = Math.floor((timer % 3600) / 60);
      let secs = timer % 60;
      if (promoDiv) {
        promoDiv.innerHTML = promoContent +
          `Следующая БЗ будет доступна через: <br><span style="font-size: 1.2em; font-weight: bold;">${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}</span>`;
      }
      timer--;
    }
  };
  activeTimerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

async function checkMission(row, resDiv, refreshBtn, baseContentHTML = null) {
  const promoDiv = document.getElementById('promo');
  if (!promoDiv) return;

  // Используем baseContentHTML если передан, иначе получаем его из resDiv
  // Это нужно, чтобы не затирать сообщения об ошибках, если они уже есть в resDiv
  let currentResText = baseContentHTML || (resDiv.innerHTML.includes('<br>') ? resDiv.innerHTML.substring(0, resDiv.innerHTML.indexOf('<br>', resDiv.innerHTML.indexOf('<br>') + 1) +1) : resDiv.innerHTML);


  if (row.promo && row.promo_time) {
    const now = Date.now();
    const promoReceivedAt = new Date(row.promo_time).getTime();
    const nextMissionAvailableAt = promoReceivedAt + 12 * 60 * 60 * 1000; // 12 часов
    const secondsLeft = Math.max(0, Math.floor((nextMissionAvailableAt - now) / 1000));

    renderMissionBtn(false);
    resDiv.innerHTML = currentResText; // Восстанавливаем базовую инфу, если checkMission ее модифицировал

    if (secondsLeft > 0) {
      renderTimer(row, resDiv, secondsLeft);
    } else {
      renderMissionBtn(true, 0);
      promoDiv.innerHTML = (row.promo ? `Ваш промокод: <b>${row.promo}</b><br>` : '') + 'Боевая задача снова доступна!';
    }
  } else if (row.mission_time && row.mission_battles != null) {
    renderMissionBtn(false);
    promoDiv.innerHTML = '';
    resDiv.innerHTML = currentResText + '<b>Сыграйте 1 бой и нажмите ОБНОВИТЬ, чтобы получить награду!</b>';
  } else {
    renderMissionBtn(true, 0);
    resDiv.innerHTML = currentResText; // Показываем только ник и бои
    promoDiv.innerHTML = row.promo ? `Ваш промокод: <b>${row.promo}</b><br>Можно получить новую БЗ.` : 'Возьмите боевую задачу!';
    if (!row.promo && !row.mission_time) { // Если нет ни промо, ни активной миссии
        promoDiv.innerHTML = 'Возьмите боевую задачу, чтобы получить промокод!';
    }
  }
}
