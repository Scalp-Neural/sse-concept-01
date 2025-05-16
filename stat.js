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
  resDiv.innerHTML = `
    <b>Ник:</b> ${data.nickname || 'N/A'}<br>
    <b>Боев:</b> ${data.battles != null ? data.battles : 'N/A'}<br>
  `;
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
    alert("Произошла ошибка инициализации интерфейса. Пожалуйста, обновите страницу.");
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
      resDiv.innerHTML = 'Не удалось загрузить данные пользователя. Попробуйте позже.';
      return;
    }

    if (row) {
      nickBlock.style.display = 'none';
      refreshBtn.style.display = '';
      renderUserStat(row, resDiv);
      await checkMission(row, resDiv, refreshBtn);
    } else {
      nickBlock.style.display = '';
      refreshBtn.style.display = 'none';
      resDiv.innerHTML = 'Пожалуйста, введите ваш никнейм для начала.';
    }
  } catch (e) {
    console.error("Общая ошибка в DOMContentLoaded:", e);
    resDiv.innerHTML = 'Произошла непредвиденная ошибка при загрузке.';
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
    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(nick)}`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || !listData.data.length) {
      resDiv.innerHTML = 'Ник не найден в игре!';
      return;
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) {
      resDiv.innerHTML = 'Не удалось получить статистику для ника.';
      return;
    }
    const userData = statData.data[accountId];
    if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      resDiv.innerHTML = 'Ошибка: не найдено количество боев в статистике!';
      return;
    }
    const battles = userData.statistics.battles ?? userData.statistics.pvp?.battles;

    const newUserRecord = { tg_id: tgId, nickname: nick, battles };
    const { error: insertError } = await supabase.from('user_stats').upsert(newUserRecord, { onConflict: 'tg_id' });

    if (insertError) {
      console.error("Ошибка сохранения в БД (upsert):", insertError);
      resDiv.innerHTML = 'Ошибка сохранения в БД: ' + insertError.message;
      return;
    }

    renderUserStat(newUserRecord, resDiv);
    nickBlock.style.display = 'none';
    refreshBtn.style.display = '';
    document.getElementById('promo').innerHTML = '';
    await checkMission(newUserRecord, resDiv, refreshBtn);

  } catch (e) {
    console.error("Ошибка при сохранении/проверке ника:", e);
    resDiv.innerHTML = `Ошибка: ${e.message || 'Произошла ошибка при получении статистики!'}`;
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  const promoDiv = document.getElementById('promo');

  // Не очищаем resDiv полностью, чтобы пользователь видел текущие данные пока идет обновление
  // resDiv.innerHTML = 'Обновляем статистику...'; // Можно заменить на менее навязчивое сообщение или индикатор
  // promoDiv.innerHTML = ''; // Не очищаем промо сразу, checkMission разберется

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для обновления или пользователь не найден:", fetchError);
      resDiv.innerHTML = 'Ошибка: не найден пользователь для обновления!'; // Перезаписываем, если критическая ошибка
      return;
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();

    if (listData.status === 'error' || !listData.data || !listData.data.length) {
      resDiv.innerHTML = 'Ник не найден в игре при обновлении!';
      return;
    }
    const accountId = listData.data[0].account_id;

    const statResp = await fetch(`https://api.korabli.su/wows/account/info/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&account_id=${accountId}`);
    if (!statResp.ok) throw new Error(`Ошибка API korabli (info): ${statResp.status}`);
    const statData = await statResp.json();

    if (statData.status === 'error' || !statData.data || !statData.data[accountId]) {
      resDiv.innerHTML = 'Не удалось получить статистику для обновления.';
      return;
    }
    const userData = statData.data[accountId];
     if (!userData.statistics || (userData.statistics.battles == null && (!userData.statistics.pvp || userData.statistics.pvp.battles == null))) {
      resDiv.innerHTML = 'Ошибка: не найдено количество боев в статистике для обновления!';
      return;
    }
    const currentBattles = userData.statistics.battles ?? userData.statistics.pvp?.battles;
    row.battles = currentBattles; // Обновляем бои в локальном объекте row

    if (row.mission_time && row.mission_battles != null && !row.promo) {
      if (currentBattles > row.mission_battles) {
        const promoCode = generatePromo();
        const promoTime = new Date().toISOString();
        const { error: updateError } = await supabase.from('user_stats').update({
          battles: currentBattles,
          promo: promoCode,
          promo_time: promoTime,
          mission_time: null,
          mission_battles: null
        }).eq('tg_id', tgId);

        if (updateError) throw updateError;

        row.promo = promoCode;
        row.promo_time = promoTime;
        row.mission_time = null;
        row.mission_battles = null;

        // renderUserStat и checkMission далее обновят интерфейс
      }
    } else {
        // Если промо не выдается, просто обновляем бои
        const { error: updateBattlesError } = await supabase.from('user_stats').update({ battles: currentBattles }).eq('tg_id', tgId);
        if (updateBattlesError) throw updateBattlesError;
    }

    // Обновляем отображение основной статистики и состояния миссии/промо
    renderUserStat(row, resDiv);
    await checkMission(row, resDiv, document.getElementById('refreshBtn'));

  } catch (e) {
    console.error("Ошибка при обновлении статистики:", e);
    // Показываем ошибку, но стараемся не затирать существующую статистику если возможно
    const currentResContent = resDiv.innerHTML;
    resDiv.innerHTML = `${currentResContent}<br><span style="color:red;">Ошибка обновления: ${e.message || 'Неизвестная ошибка'}</span>`;
  }
};

async function onGetMission() {
  const resDiv = document.getElementById('result');
  const promoDiv = document.getElementById('promo');
  // resDiv.innerHTML = 'Получаем боевую задачу...'; // Не перезаписываем все, а добавляем
  // promoDiv.innerHTML = ''; // checkMission позаботится об этом

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('nickname, battles')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для БЗ:", fetchError);
      resDiv.innerHTML = 'Ошибка: не найден пользователь для получения БЗ!';
      return;
    }

    const listResp = await fetch(`https://api.korabli.su/wows/account/list/?application_id=2ed4a3f67dc2d36d19643b616433ad9a&search=${encodeURIComponent(row.nickname)}`);
    if (!listResp.ok) throw new Error(`Ошибка API korabli (list): ${listResp.status}`);
    const listData = await listResp.json();
    if (listData.status === 'error' || !listData.data || !listData.data.length) throw new Error('Ник не найден при получении БЗ');
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

    renderUserStat(row, resDiv);
    // Сообщение о полученной БЗ будет сформировано в checkMission
    await checkMission(row, resDiv, document.getElementById('refreshBtn'));


  } catch (e) {
    console.error("Ошибка в onGetMission:", e);
    // Показываем ошибку, но стараемся не затирать существующую статистику
    const currentResContent = resDiv.innerHTML;
    resDiv.innerHTML = `${currentResContent}<br><span style="color:red;">Ошибка получения БЗ: ${e.message || 'Неизвестная ошибка'}</span>`;
  }
}

function generatePromo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function renderTimer(row, resDiv, secondsLeft) {
  const promoDiv = document.getElementById('promo');
  const promoCodeText = row.promo ? `<b>Ваш промокод: ${row.promo}</b><br>` : '';

  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
  }
  let timer = Math.max(0, secondsLeft);
  renderMissionBtn(false); // Скрываем кнопку "Получить БЗ"

  const updateTimerDisplay = () => {
    if (timer <= 0) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      renderMissionBtn(true, 0); // Показать кнопку "Получить БЗ"
      if (promoDiv) {
        promoDiv.innerHTML = promoCodeText + 'Боевая задача снова доступна!';
      }
      // Возможно, стоит вызвать checkMission для полного обновления состояния,
      // но это может быть избыточно и привести к рекурсии, если неаккуратно.
      // Вместо этого, refreshBtn.onclick может быть нажат пользователем.
    } else {
      let hours = Math.floor(timer / 3600);
      let minutes = Math.floor((timer % 3600) / 60);
      let secs = timer % 60;
      if (promoDiv) {
        promoDiv.innerHTML = promoCodeText +
          `Следующая БЗ будет доступна через: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      timer--;
    }
  };

  activeTimerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay(); // Немедленный первый вызов для отображения таймера
}

async function checkMission(row, resDiv, refreshBtn) {
  const promoDiv = document.getElementById('promo');
  if (!promoDiv) return; // Если нет promoDiv, ничего не делаем с ним

  // renderUserStat(row, resDiv); // Статистика пользователя всегда отображается перед спецификой миссии

  if (row.promo && row.promo_time) {
    // Есть промокод, проверяем кулдаун для следующей БЗ
    const now = Date.now();
    const promoReceivedAt = new Date(row.promo_time).getTime();
    const nextMissionAvailableAt = promoReceivedAt + 12 * 60 * 60 * 1000; // 12 часов
    const secondsLeft = Math.max(0, Math.floor((nextMissionAvailableAt - now) / 1000));

    renderMissionBtn(false); // Кнопка "Получить БЗ" скрыта

    if (secondsLeft > 0) {
      renderTimer(row, resDiv, secondsLeft); // Запускаем/обновляем таймер
    } else {
      // Кулдаун истек, можно брать новую БЗ
      renderMissionBtn(true, 0);
      const promoCodeDisplay = row.promo ? `<b>Ваш промокод: ${row.promo}</b><br>` : '';
      promoDiv.innerHTML = promoCodeDisplay + 'Боевая задача снова доступна!';
    }
  } else if (row.mission_time && row.mission_battles != null) {
    // Миссия активна, промокода еще нет
    renderMissionBtn(false);
    promoDiv.innerHTML = ''; // Очищаем промо-блок, так как промокода нет
    // Обновляем только текстовую часть в resDiv, основная статистика уже от renderUserStat
    let currentResContent = resDiv.innerHTML.split('<br><b>Боевая задача активна')[0].split('<br><b>Сыграйте 1 бой')[0];
    resDiv.innerHTML = currentResContent + '<br><b>Сыграйте 1 бой и нажмите ОБНОВИТЬ, чтобы получить награду!</b>';
  } else {
    // Миссия не взята, промокода нет (или его кулдаун истек и он просто отображается)
    renderMissionBtn(true, 0);
    // Если есть старый промокод (без активного mission_time), просто показываем его.
    // Если нет - очищаем.
    promoDiv.innerHTML = row.promo ? `<b>Ваш промокод: ${row.promo}</b><br>Можно получить новую БЗ.` : '';
  }
}
