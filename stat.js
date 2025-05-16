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
  let baseContent = `<b>Ник:</b> ${data.nickname || 'N/A'}<br><b>Боев:</b> ${data.battles != null ? data.battles : 'N/A'}<br>`;
  resDiv.innerHTML = baseContent;
  return baseContent;
}

function renderMissionBtn(show, timerSec = 0) {
  const btnBox = document.getElementById('missionBtnBox');
  if (!btnBox) {
    console.error("Элемент #missionBtnBox не найден!");
    return;
  }
  btnBox.innerHTML = '';
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
  const refreshBtnElement = document.getElementById('refreshBtn');
  const promoDiv = document.getElementById('promo');

  if (!resDiv || !nickBlock || !refreshBtnElement || !promoDiv) {
    console.error("Один или несколько ключевых HTML элементов не найдены!");
    resDiv.innerHTML = '<span class="error-message">Ошибка инициализации интерфейса. Обновите.</span>';
    return;
  }

  refreshBtnElement.style.display = 'none';
  promoDiv.innerHTML = '';
  promoDiv.style.display = 'none'; // Скрываем изначально

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
      refreshBtnElement.style.display = '';
      const baseContent = renderUserStat(row, resDiv);
      await checkMission(row, resDiv, refreshBtnElement, baseContent);
    } else {
      nickBlock.style.display = '';
      refreshBtnElement.style.display = 'none';
      resDiv.innerHTML = 'Пожалуйста, введите ваш никнейм для начала.';
    }
  } catch (e) {
    console.error("Общая ошибка в DOMContentLoaded:", e);
    resDiv.innerHTML = '<span class="error-message">Непредвиденная ошибка при загрузке.</span>';
  }
});

document.getElementById('saveBtn').onclick = async () => {
  const nickInput = document.getElementById('nickname');
  const enteredNick = nickInput.value.trim(); // Используем enteredNick
  const resDiv = document.getElementById('result');
  const nickBlock = document.getElementById('nickBlock');
  const refreshBtnElement = document.getElementById('refreshBtn');
  const saveBtnElement = document.getElementById('saveBtn');
  const promoDiv = document.getElementById('promo');

  if (!enteredNick) {
    alert('Введите ник!');
    return;
  }

  saveBtnElement.disabled = true;
  resDiv.innerHTML = 'Проверяем ник...';

  try {
    let { data: existingUserWithNick, error: nickCheckError } = await supabase
      .from('user_stats')
      .select('tg_id')
      .eq('nickname', enteredNick) // Проверяем enteredNick
      .not('tg_id', 'eq', tgId)
      .maybeSingle();

    if (nickCheckError) {
      console.error("Ошибка проверки уникальности ника в Supabase:", nickCheckError);
      resDiv.innerHTML = '<span class="error-message">Ошибка при проверке ника в базе. Попробуйте позже.</span>';
      saveBtnElement.disabled = false;
      return;
    }

    if (existingUserWithNick) {
      resDiv.innerHTML = '<span class="warning-message">Имя аккаунта уже используется другим пользователем. Пожалуйста, введите свой никнейм.</span>';
      saveBtnElement.disabled = false;
      return;
    }

    // Используем type=exact для API
    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(enteredNick)}&type=exact`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || listData.data.length === 0) {
      resDiv.innerHTML = '<span class="warning-message">Ник не найден в игре! Убедитесь, что ввели его правильно.</span>';
      saveBtnElement.disabled = false;
      return;
    }
    
    // Дополнительная проверка на точное совпадение (с учетом регистра для API, но не для введенного пользователем)
    const foundAccount = listData.data.find(acc => acc.nickname.toLowerCase() === enteredNick.toLowerCase());

    if (!foundAccount) {
        resDiv.innerHTML = '<span class="warning-message">Точный ник не найден. Пожалуйста, проверьте написание.</span>';
        saveBtnElement.disabled = false;
        return;
    }
    const accountId = foundAccount.account_id;
    const actualNickFromApi = foundAccount.nickname; // Используем ник из API

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) {
      resDiv.innerHTML = '<span class="warning-message">Не удалось получить статистику для ника.</span>';
      saveBtnElement.disabled = false;
      return;
    }
    const userData = statData.data[accountId];
    if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      resDiv.innerHTML = '<span class="error-message">Ошибка: не найдено количество боев в статистике!</span>';
      saveBtnElement.disabled = false;
      return;
    }
    const battles = userData.statistics.battles ?? userData.statistics.pvp?.battles;

    // Сохраняем actualNickFromApi
    const newUserRecord = { tg_id: tgId, nickname: actualNickFromApi, battles: battles, mission_battles: null, mission_time: null, promo: null, promo_time: null };
    const { error: upsertError } = await supabase.from('user_stats').upsert(newUserRecord, { onConflict: 'tg_id' });

    if (upsertError) {
      console.error("Ошибка сохранения в БД (upsert):", upsertError);
      resDiv.innerHTML = '<span class="error-message">Ошибка сохранения в БД: ' + upsertError.message + '</span>';
      saveBtnElement.disabled = false;
      return;
    }

    const baseContent = renderUserStat(newUserRecord, resDiv);
    nickBlock.style.display = 'none';
    refreshBtnElement.style.display = '';
    
    promoDiv.innerHTML = '';       // Очищаем и скрываем промо
    promoDiv.style.display = 'none'; // при новом входе
    await checkMission(newUserRecord, resDiv, refreshBtnElement, baseContent);

  } catch (e) {
    console.error("Ошибка при сохранении/проверке ника:", e);
    resDiv.innerHTML = `<span class="error-message">Ошибка: ${e.message || 'Произошла ошибка при получении статистики!'}</span>`;
  } finally {
    saveBtnElement.disabled = false;
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  const refreshBtnElement = document.getElementById('refreshBtn');

  let statusMessage = document.createElement('span');
  statusMessage.className = 'update-status-message';
  statusMessage.style.fontSize = '0.9em';
  statusMessage.style.color = '#aaa';
  statusMessage.innerText = '\nОбновление данных...';
  
  if (!resDiv.querySelector('.update-status-message')) {
      resDiv.appendChild(statusMessage);
  }
  refreshBtnElement.disabled = true;

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для обновления или пользователь не найден:", fetchError);
      renderUserStat({}, resDiv);
      resDiv.innerHTML += '<br><span class="error-message">Ошибка: не найден пользователь для обновления!</span>';
      return;
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}&type=exact`); // Добавим type=exact и здесь для консистентности
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    // При обновлении, если ник не найден (хотя должен быть, раз он в базе), это проблема
    if (listData.status === 'error' || !listData.data || !listData.data.length || listData.data[0].nickname.toLowerCase() !== row.nickname.toLowerCase()) {
      const baseContent = renderUserStat(row, resDiv);
      resDiv.innerHTML = baseContent + `<br><span class="warning-message">Ник ${row.nickname} не найден в игре при обновлении или изменился!</span>`;
      return;
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) {
      const baseContent = renderUserStat(row, resDiv);
      resDiv.innerHTML = baseContent + '<br><span class="warning-message">Не удалось получить статистику для обновления.</span>';
      return;
    }
    const userData = statData.data[accountId];
     if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      const baseContent = renderUserStat(row, resDiv);
      resDiv.innerHTML = baseContent + '<br><span class="error-message">Ошибка: не найдено количество боев в статистике для обновления!</span>';
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
    
    row.battles = currentBattles;

    const { error: updateError } = await supabase.from('user_stats').update(updatePayload).eq('tg_id', tgId);
    if (updateError) throw updateError;

    const baseContent = renderUserStat(row, resDiv);
    await checkMission(row, resDiv, refreshBtnElement, baseContent);

  } catch (e) {
    console.error("Ошибка при обновлении статистики:", e);
    let { data: currentRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle();
    const base = renderUserStat(currentRow || { nickname: 'N/A', battles: 'N/A'}, resDiv);
    resDiv.innerHTML = base + `<br><span class="error-message">Ошибка обновления: ${e.message || 'Неизвестная ошибка'}</span>`;
  } finally {
    const existingStatusMessage = resDiv.querySelector('.update-status-message');
    if (existingStatusMessage) {
        existingStatusMessage.remove();
    }
    refreshBtnElement.disabled = false;
  }
};

async function onGetMission() {
  const resDiv = document.getElementById('result');
  const getMissionButton = document.getElementById('getMissionBtn');
  const refreshBtnElement = document.getElementById('refreshBtn');

  if (getMissionButton) getMissionButton.disabled = true;

  if (!resDiv.innerText.includes('Получаем боевую задачу...')) {
    resDiv.innerHTML += '\nПолучаем боевую задачу...';
  }

  try {
    let { data: row, error: fetchUserError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchUserError || !row) {
      console.error("Ошибка получения пользователя для БЗ или пользователь не найден:", fetchUserError);
      const baseContent = renderUserStat(row || {}, resDiv);
      resDiv.innerHTML = baseContent + '<br><span class="error-message">Ошибка: не найден пользователь для получения БЗ!</span>';
      return;
    }

    if (row.promo && row.promo_time) {
      const now = Date.now();
      const promoReceivedAt = new Date(row.promo_time).getTime();
      const cooldownPeriod = 12 * 60 * 60 * 1000;
      const timeSincePromo = now - promoReceivedAt;

      if (timeSincePromo < cooldownPeriod) {
        const timeLeft = cooldownPeriod - timeSincePromo;
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        
        const baseContent = renderUserStat(row, resDiv);
        resDiv.innerHTML = baseContent + `<br><span class="warning-message">Новая боевая задача будет доступна через ${hours} ч ${minutes} мин.</span>`;
        await checkMission(row, resDiv, refreshBtnElement, baseContent);
        return;
      }
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}&type=exact`); // type=exact и здесь
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();
    // Проверка, что API вернул именно тот ник, который у нас в базе (на случай если ник в игре сменился)
    if (listData.status === 'error' || !listData.data || !listData.data.length || listData.data[0].nickname.toLowerCase() !== row.nickname.toLowerCase()) {
        throw new Error(`Ник ${row.nickname} не найден или изменился в игре при получении БЗ`);
    }
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

    row.battles = currentBattlesForMission;
    row.mission_battles = currentBattlesForMission;
    row.mission_time = missionTime;
    row.promo = null;
    row.promo_time = null;

    const baseContent = renderUserStat(row, resDiv);
    await checkMission(row, resDiv, refreshBtnElement, baseContent);

  } catch (e) {
    console.error("Ошибка в onGetMission:", e);
    let { data: currentRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle();
    const base = renderUserStat(currentRow || { nickname: 'N/A', battles: 'N/A'}, resDiv);
    resDiv.innerHTML = base + `<br><span class="error-message">Ошибка получения БЗ: ${e.message || 'Неизвестная ошибка'}</span>`;
  } finally {
    // checkMission управляет состоянием getMissionButton
  }
}

function generatePromo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function renderTimer(row, resDiv, secondsLeft) {
  const promoDiv = document.getElementById('promo');
  if (!promoDiv) return;

  const promoCodeText = row.promo ? `<b>${row.promo}</b>` : '';

  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
  }
  
  let timer = Math.max(0, secondsLeft); 
  renderMissionBtn(false);
  promoDiv.style.display = ''; // Показываем блок

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
        promoDiv.style.display = promoDiv.innerHTML.trim() ? '' : 'none';
      }
    } else {
      let hours = Math.floor(timer / 3600);
      let minutes = Math.floor((timer % 3600) / 60);
      let secs = timer % 60;
      if (promoDiv) {
        promoDiv.innerHTML = promoContent +
          `Следующая БЗ будет доступна через: <br><span style="font-size: 1.2em; font-weight: bold;">${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}</span>`;
        // promoDiv.style.display = ''; // Уже показан в начале renderTimer
      }
      timer--;
    }
  };
  activeTimerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

async function checkMission(row, resDiv, refreshBtnElement, baseContentHTML = null) {
  const promoDiv = document.getElementById('promo');
  if (!promoDiv) return;

  let currentResText = baseContentHTML || resDiv.innerHTML.split('<br><b>')[0] + '<br>';
  currentResText = currentResText.split('<span class="update-status-message">')[0].trim();
  if (currentResText && !currentResText.endsWith('<br>')) currentResText += '<br>';


  promoDiv.innerHTML = ''; 
  promoDiv.style.display = 'none'; 

  if (row.promo && row.promo_time) {
    const now = Date.now();
    const promoReceivedAt = new Date(row.promo_time).getTime();
    const nextMissionAvailableAt = promoReceivedAt + 12 * 60 * 60 * 1000;
    const secondsLeft = Math.max(0, Math.floor((nextMissionAvailableAt - now) / 1000));

    resDiv.innerHTML = currentResText.replace(/<br>$/, "");

    if (secondsLeft > 0) {
      renderMissionBtn(false);
      renderTimer(row, resDiv, secondsLeft);
    } else {
      renderMissionBtn(true, 0);
      promoDiv.innerHTML = (row.promo ? `Ваш промокод: <b>${row.promo}</b><br>` : '') + 'Боевая задача снова доступна!';
      promoDiv.style.display = promoDiv.innerHTML.trim() ? '' : 'none';
    }
  } else if (row.mission_time && row.mission_battles != null) {
    renderMissionBtn(false);
    resDiv.innerHTML = currentResText + '<b>Сыграйте 1 бой и нажмите ОБНОВИТЬ, чтобы получить награду!</b>';
  } else {
    renderMissionBtn(true, 0);
    resDiv.innerHTML = currentResText.replace(/<br>$/, "");
    if (row.promo) { 
        promoDiv.innerHTML = `Ваш промокод: <b>${row.promo}</b><br>Можно получить новую БЗ.`;
    } else {
        promoDiv.innerHTML = 'Возьмите боевую задачу, чтобы получить промокод!';
    }
    promoDiv.style.display = promoDiv.innerHTML.trim() ? '' : 'none';
  }
}
