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
  return 'test_id';
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
  const loadingBlock = document.getElementById('loadingBlock');
  const missionBtnBox = document.getElementById('missionBtnBox');

  if (!resDiv || !nickBlock || !refreshBtnElement || !promoDiv || !loadingBlock || !missionBtnBox) {
    console.error("Ключевые HTML элементы не найдены!");
    if (loadingBlock) loadingBlock.textContent = 'Ошибка интерфейса!'; else alert('Ошибка интерфейса!');
    return;
  }

  // Начальное состояние: Показываем загрузку, скрываем остальное
  loadingBlock.style.display = '';
  nickBlock.style.display = 'none';
  refreshBtnElement.style.display = 'none';
  resDiv.style.display = 'none';
  promoDiv.style.display = 'none';
  promoDiv.innerHTML = '';
  missionBtnBox.innerHTML = '';

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    loadingBlock.style.display = 'none'; // Скрываем загрузку здесь

    if (fetchError) {
      console.error("Ошибка получения данных пользователя из Supabase:", fetchError);
      resDiv.innerHTML = '<span class="error-message">Не удалось загрузить данные. Попробуйте позже.</span>';
      resDiv.style.display = '';
      return;
    }

    if (row) {
      // Пользователь существует
      resDiv.style.display = ''; // Показываем блок для статистики
      refreshBtnElement.style.display = ''; // Показываем кнопку Обновить
      // nickBlock остается 'none'

      const baseContent = renderUserStat(row, resDiv); // Отображаем основную стату
      await checkMission(row, resDiv, refreshBtnElement, baseContent); // checkMission управляет promoDiv и missionBtnBox
    } else {
      // Новый пользователь или нет данных
      nickBlock.style.display = ''; // Показываем блок ввода ника
      resDiv.style.display = '';    // Показываем блок для сообщения
      resDiv.innerHTML = 'Пожалуйста, введите ваш никнейм для начала.';
      // refreshBtnElement, promoDiv, missionBtnBox остаются 'none'/'empty'
    }
  } catch (e) {
    console.error("Общая ошибка в DOMContentLoaded:", e);
    if (loadingBlock) loadingBlock.style.display = 'none';
    resDiv.innerHTML = '<span class="error-message">Непредвиденная ошибка при загрузке.</span>';
    resDiv.style.display = '';
  }
});

document.getElementById('saveBtn').onclick = async () => {
  const nickInput = document.getElementById('nickname');
  const enteredNick = nickInput.value.trim();
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
  resDiv.style.display = ''; // Показать resDiv для сообщения "Проверяем ник..."

  try {
    let { data: existingUserWithNick, error: nickCheckError } = await supabase
      .from('user_stats')
      .select('tg_id')
      .eq('nickname', enteredNick)
      .not('tg_id', 'eq', tgId)
      .maybeSingle();

    if (nickCheckError) throw nickCheckError;
    if (existingUserWithNick) {
      resDiv.innerHTML = '<span class="warning-message">Имя аккаунта уже используется. Пожалуйста, введите свой никнейм.</span>';
      saveBtnElement.disabled = false;
      return;
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(enteredNick)}&type=exact`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || listData.data.length === 0) {
      resDiv.innerHTML = '<span class="warning-message">Ник не найден в игре! Убедитесь, что ввели его правильно.</span>';
      saveBtnElement.disabled = false;
      return;
    }
    
    const foundAccount = listData.data.find(acc => acc.nickname.toLowerCase() === enteredNick.toLowerCase());
    if (!foundAccount) {
        resDiv.innerHTML = '<span class="warning-message">Точный ник не найден. Пожалуйста, проверьте написание.</span>';
        saveBtnElement.disabled = false;
        return;
    }
    const accountId = foundAccount.account_id;
    const actualNickFromApi = foundAccount.nickname;

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

    const newUserRecord = { tg_id: tgId, nickname: actualNickFromApi, battles: battles, mission_battles: null, mission_time: null, promo: null, promo_time: null };
    const { error: upsertError } = await supabase.from('user_stats').upsert(newUserRecord, { onConflict: 'tg_id' });
    if (upsertError) throw upsertError;

    nickBlock.style.display = 'none';
    refreshBtnElement.style.display = '';
    promoDiv.innerHTML = '';       
    promoDiv.style.display = 'none'; 
    const baseContent = renderUserStat(newUserRecord, resDiv);
    await checkMission(newUserRecord, resDiv, refreshBtnElement, baseContent);

  } catch (e) {
    console.error("Ошибка при сохранении/проверке ника:", e);
    resDiv.innerHTML = `<span class="error-message">Ошибка: ${e.message || 'Произошла неизвестная ошибка'}</span>`;
    // resDiv.style.display = ''; // Уже должен быть показан
  } finally {
    saveBtnElement.disabled = false;
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  const refreshBtnElement = document.getElementById('refreshBtn');

  let statusMessage = resDiv.querySelector('.update-status-message');
  if (!statusMessage) {
      statusMessage = document.createElement('span');
      statusMessage.className = 'update-status-message';
      statusMessage.style.fontSize = '0.9em';
      statusMessage.style.color = '#aaa';
      resDiv.appendChild(statusMessage);
  }
  statusMessage.innerText = '\nОбновление данных...';
  refreshBtnElement.disabled = true;

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) throw (fetchError || new Error("Пользователь не найден для обновления"));
    
    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}&type=exact`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || !listData.data.length || listData.data[0].nickname.toLowerCase() !== row.nickname.toLowerCase()) {
      const baseContent = renderUserStat(row, resDiv); // Показать старые данные
      statusMessage.remove(); // Убираем "Обновление...", т.к. выводим конкретную ошибку
      resDiv.innerHTML = baseContent + `<br><span class="warning-message">Ник ${row.nickname} не найден в игре при обновлении или изменился!</span>`;
      refreshBtnElement.disabled = false; // Разблокировать кнопку
      return;
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) throw new Error('Не удалось получить статистику для обновления.');
    const userData = statData.data[accountId];
    if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      throw new Error('Ошибка: не найдено количество боев в статистике для обновления!');
    }
    const currentBattles = userData.statistics.battles ?? userData.statistics.pvp?.battles;
    
    let updatePayload = { battles: currentBattles };

    if (row.mission_time && row.mission_battles != null && !row.promo) {
      if (currentBattles > row.mission_battles) {
        const promoCode = generatePromo();
        const promoTime = new Date().toISOString();
        Object.assign(updatePayload, { promo: promoCode, promo_time: promoTime, mission_time: null, mission_battles: null });
        row.promo = promoCode; row.promo_time = promoTime; row.mission_time = null; row.mission_battles = null;
      }
    }
    row.battles = currentBattles;

    const { error: updateError } = await supabase.from('user_stats').update(updatePayload).eq('tg_id', tgId);
    if (updateError) throw updateError;

    if (statusMessage) statusMessage.remove(); // Убираем "Обновление данных..."
    const baseContent = renderUserStat(row, resDiv);
    await checkMission(row, resDiv, refreshBtnElement, baseContent);

  } catch (e) {
    console.error("Ошибка при обновлении статистики:", e);
    if (statusMessage) statusMessage.remove();
    let { data: currentRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle(); // Попытка получить актуальные данные
    const base = renderUserStat(currentRow || { nickname: 'N/A', battles: 'N/A'}, resDiv);
    resDiv.innerHTML = base + `<br><span class="error-message">Ошибка обновления: ${e.message || 'Неизвестная ошибка'}</span>`;
  } finally {
    if (statusMessage && statusMessage.parentNode) { // Доп. проверка перед удалением
        statusMessage.remove();
    }
    refreshBtnElement.disabled = false;
  }
};

async function onGetMission() {
  const resDiv = document.getElementById('result');
  const getMissionButton = document.getElementById('getMissionBtn');
  const refreshBtnElement = document.getElementById('refreshBtn');

  if (getMissionButton) getMissionButton.disabled = true;

  let statusMsgElement = resDiv.querySelector('.mission-status-message');
  if (!statusMsgElement) {
      statusMsgElement = document.createElement('span');
      statusMsgElement.className = 'mission-status-message';
      statusMsgElement.style.display = 'block'; // Чтобы было на новой строке
      resDiv.appendChild(statusMsgElement);
  }
  statusMsgElement.innerText = 'Получаем боевую задачу...';


  try {
    let { data: row, error: fetchUserError } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle();
    if (fetchUserError || !row) throw (fetchUserError || new Error("Пользователь не найден для БЗ"));

    if (row.promo && row.promo_time) {
      const now = Date.now();
      const promoReceivedAt = new Date(row.promo_time).getTime();
      const cooldownPeriod = 12 * 60 * 60 * 1000;
      if ((now - promoReceivedAt) < cooldownPeriod) {
        const timeLeft = cooldownPeriod - (now - promoReceivedAt);
        const hours = Math.floor(timeLeft / (3600000));
        const minutes = Math.floor((timeLeft % (3600000)) / (60000));
        statusMsgElement.remove(); // Убираем "Получаем БЗ..."
        const baseContent = renderUserStat(row, resDiv); // Перерисовываем стату
        resDiv.innerHTML = baseContent + `<br><span class="warning-message">Новая БЗ будет доступна через ${hours} ч ${minutes} мин.</span>`;
        await checkMission(row, resDiv, refreshBtnElement, baseContent);
        return;
      }
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}&type=exact`);
    if (!listResp.ok) throw new Error(`API error (list): ${listResp.status}`);
    const listData = await listResp.json();
    if (listData.status === 'error' || !listData.data || !listData.data.length || listData.data[0].nickname.toLowerCase() !== row.nickname.toLowerCase()) {
        throw new Error(`Ник ${row.nickname} не найден/изменился в игре.`);
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`API error (info): ${statResp.status}`);
    const statData = await statResp.json();
    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) throw new Error('Не удалось получить статистику для БЗ.');
    const userData = statData.data[accountId];
    if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
       throw new Error('Нет данных о боях в статистике для БЗ!');
    }
    const currentBattlesForMission = userData.statistics.battles ?? userData.statistics.pvp?.battles;

    const missionUpdate = { mission_battles: currentBattlesForMission, mission_time: new Date().toISOString(), battles: currentBattlesForMission, promo: null, promo_time: null };
    const { error: updateError } = await supabase.from('user_stats').update(missionUpdate).eq('tg_id', tgId);
    if (updateError) throw updateError;

    Object.assign(row, missionUpdate); // Обновляем локальный row

    if (statusMsgElement) statusMsgElement.remove(); // Убираем "Получаем БЗ..."
    const baseContent = renderUserStat(row, resDiv);
    await checkMission(row, resDiv, refreshBtnElement, baseContent);

  } catch (e) {
    console.error("Ошибка в onGetMission:", e);
    if (statusMsgElement) statusMsgElement.remove();
    let { data: currentRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle();
    const base = renderUserStat(currentRow || { nickname: 'N/A', battles: 'N/A'}, resDiv);
    resDiv.innerHTML = base + `<br><span class="error-message">Ошибка получения БЗ: ${e.message || 'Неизвестная ошибка'}</span>`;
  } finally {
    // checkMission управляет финальным состоянием getMissionButton
  }
}

function generatePromo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function renderTimer(row, resDiv, secondsLeft) {
  const promoDiv = document.getElementById('promo');
  if (!promoDiv) return;

  const promoCodeText = row.promo ? `<b>${row.promo}</b>` : '';
  if (activeTimerInterval) clearInterval(activeTimerInterval);
  
  let timer = Math.max(0, secondsLeft); 
  renderMissionBtn(false); // Кнопка БЗ скрыта пока таймер
  promoDiv.style.display = ''; // Показываем блок промо

  const updateTimerDisplay = () => {
    let promoContent = row.promo ? `Ваш промокод: ${promoCodeText}<br>` : '';
    if (timer <= 0) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      renderMissionBtn(true, 0); // Таймер истек, кнопка БЗ доступна
      if (promoDiv) {
        promoDiv.innerHTML = promoContent + 'Боевая задача снова доступна!';
        promoDiv.style.display = promoDiv.innerHTML.trim() ? '' : 'none';
      }
    } else {
      let h = Math.floor(timer / 3600);
      let m = Math.floor((timer % 3600) / 60);
      let s = timer % 60;
      if (promoDiv) {
        promoDiv.innerHTML = promoContent +
          `Следующая БЗ будет доступна через: <br><span style="font-size: 1.2em; font-weight: bold;">${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</span>`;
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

  // Очищаем resDiv от старых сообщений БЗ/ошибок, оставляя только базовую стату
  let currentResBaseText = baseContentHTML || (resDiv.innerHTML.includes("<b>Боев:</b>") ? 
    resDiv.innerHTML.substring(0, resDiv.innerHTML.indexOf("<b>Боев:</b>") + resDiv.innerHTML.substring(resDiv.innerHTML.indexOf("<b>Боев:</b>")).indexOf("<br>") + 4) : 
    resDiv.innerHTML.split('<br><span class="')[0] // запасной вариант если нет "Боев:"
  );
  currentResBaseText = currentResBaseText.split('<span class="update-status-message">')[0].trim();
  resDiv.innerHTML = currentResBaseText; // Устанавливаем только базовую стату

  promoDiv.innerHTML = ''; 
  promoDiv.style.display = 'none'; 

  if (row.promo && row.promo_time) {
    const now = Date.now();
    const promoReceivedAt = new Date(row.promo_time).getTime();
    const nextMissionAvailableAt = promoReceivedAt + 12 * 60 * 60 * 1000;
    const secondsLeft = Math.max(0, Math.floor((nextMissionAvailableAt - now) / 1000));

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
    resDiv.innerHTML += '<br><b>Сыграйте 1 бой и нажмите ОБНОВИТЬ, чтобы получить награду!</b>';
  } else {
    renderMissionBtn(true, 0);
    if (row.promo) { 
        promoDiv.innerHTML = `Ваш промокод: <b>${row.promo}</b><br>Можно получить новую БЗ.`;
    } else {
        promoDiv.innerHTML = 'Возьмите боевую задачу, чтобы получить промокод!';
    }
    promoDiv.style.display = promoDiv.innerHTML.trim() ? '' : 'none';
  }
}
