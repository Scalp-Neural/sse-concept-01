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

// УЛУЧШЕНИЕ: Переменная для хранения ID активного таймера
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

// Глобальные переменные для состояния пользователя, если они действительно нужны глобально.
// Рассмотрите возможность передавать их как часть объекта `row` или управлять состоянием более явно.
// let mission_battles_global = null;
// let mission_time_global = null;
// let promo_code_global = null;
// let last_battles_global = null;

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
  promoDiv.innerHTML = ''; // Очищаем промо-блок при загрузке

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
      // last_battles_global = row.battles;
      // mission_battles_global = row.mission_battles;
      // mission_time_global = row.mission_time;
      // promo_code_global = row.promo;
      renderUserStat(row, resDiv);
      await checkMission(row, resDiv, refreshBtn); // promoDiv передается для отображения промокода внутри checkMission/renderTimer
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
    const { error: insertError } = await supabase.from('user_stats').upsert(newUserRecord, { onConflict: 'tg_id' }); // Используем upsert для обновления если пользователь уже есть

    if (insertError) {
      console.error("Ошибка сохранения в БД (upsert):", insertError);
      resDiv.innerHTML = 'Ошибка сохранения в БД: ' + insertError.message;
      return;
    }

    renderUserStat(newUserRecord, resDiv);
    nickBlock.style.display = 'none';
    refreshBtn.style.display = '';
    document.getElementById('promo').innerHTML = ''; // Очищаем промо при новом входе/обновлении ника
    await checkMission(newUserRecord, resDiv, refreshBtn); // Передаем новый (или обновленный) рекорд

  } catch (e) {
    console.error("Ошибка при сохранении/проверке ника:", e);
    resDiv.innerHTML = `Ошибка: ${e.message || 'Произошла ошибка при получении статистики!'}`;
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  const resDiv = document.getElementById('result');
  const promoDiv = document.getElementById('promo');

  resDiv.innerHTML = 'Обновляем статистику...';
  promoDiv.innerHTML = ''; // Очищаем промо при обновлении

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для обновления или пользователь не найден:", fetchError);
      resDiv.innerHTML = 'Ошибка: не найден пользователь для обновления!';
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

    // Обновляем данные в объекте row для дальнейшего использования
    row.battles = currentBattles;

    // Проверяем прирост для промокода
    if (row.mission_time && row.mission_battles != null && !row.promo) {
      if (currentBattles > row.mission_battles) {
        const promoCode = generatePromo();
        const promoTime = new Date().toISOString();
        const { error: updateError } = await supabase.from('user_stats').update({
          battles: currentBattles,
          promo: promoCode,
          promo_time: promoTime,
          mission_time: null, // Сбрасываем миссию после выдачи промо
          mission_battles: null
        }).eq('tg_id', tgId);

        if (updateError) throw updateError;

        row.promo = promoCode; // Обновляем локальный row
        row.promo_time = promoTime;
        row.mission_time = null;
        row.mission_battles = null;

        renderUserStat(row, resDiv);
        promoDiv.innerHTML = `<b>Ваш промокод: ${promoCode}</b>`;
        // renderMissionBtn(false); // Кнопка будет обработана в checkMission или renderTimer
        await checkMission(row, resDiv, document.getElementById('refreshBtn')); // Перепроверяем состояние, чтобы запустить таймер
        return;
      }
    }

    // Просто обновляем бои, если промокод не был выдан
    const { error: updateBattlesError } = await supabase.from('user_stats').update({ battles: currentBattles }).eq('tg_id', tgId);
    if (updateBattlesError) throw updateBattlesError;

    renderUserStat(row, resDiv); // row уже содержит обновленные currentBattles
    await checkMission(row, resDiv, document.getElementById('refreshBtn'));

  } catch (e) {
    console.error("Ошибка при обновлении статистики:", e);
    resDiv.innerHTML = `Ошибка: ${e.message || 'Произошла ошибка при обновлении!'}`;
  }
};

async function onGetMission() {
  const resDiv = document.getElementById('result');
  const promoDiv = document.getElementById('promo');
  resDiv.innerHTML = 'Получаем боевую задачу...';
  promoDiv.innerHTML = ''; // Очищаем промо

  try {
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('nickname, battles') // Запрашиваем только нужные поля
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError || !row) {
      console.error("Ошибка получения пользователя для БЗ:", fetchError);
      resDiv.innerHTML = 'Ошибка: не найден пользователь для получения БЗ!';
      return;
    }

    // Получаем актуальное число боёв для mission_battles
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
      battles: currentBattlesForMission, // Также обновляем основное количество боев
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

    renderUserStat(row, resDiv); // row.battles теперь актуальны
    resDiv.innerHTML += `<br><b>Боевая задача получена! Теперь вам нужно сыграть несколько боев. После этого нажмите "Обновить".</b>`;
    // renderMissionBtn(false); // Кнопка будет обработана в checkMission
    await checkMission(row, resDiv, document.getElementById('refreshBtn'));


  } catch (e) {
    console.error("Ошибка в onGetMission:", e);
    resDiv.innerHTML = `Ошибка: ${e.message || 'Не удалось получить БЗ!'}`;
  }
}

function generatePromo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function renderTimer(row, resDiv, secondsLeft) {
  const promoDiv = document.getElementById('promo');

  if (activeTimerInterval) {
    clearInterval(activeTimerInterval); // Очищаем старый таймер, если он был
  }

  let timer = Math.max(0, secondsLeft); // Убедимся, что таймер не отрицательный

  renderMissionBtn(false); // Скрываем кнопку "Получить БЗ", пока идет таймер
  if (promoDiv) promoDiv.innerHTML = `Следующая БЗ будет доступна через таймер.`;


  activeTimerInterval = setInterval(() => {
    const missionBtn = document.getElementById('getMissionBtn'); // Кнопка, которую мы создаем в renderMissionBtn

    if (timer <= 0) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      renderMissionBtn(true, 0); // Показать кнопку "Получить БЗ"
      if (promoDiv) promoDiv.innerHTML = ''; // Очистить сообщение о таймере
      // resDiv может быть перезаписан, лучше добавлять сообщение в promoDiv или отдельный статус-блок
      const statusDiv = document.getElementById('promo') || resDiv; // Используем promo или result для сообщения
      statusDiv.innerHTML += '<br><b>Боевая задача снова доступна!</b>';

      // Перепроверяем состояние, чтобы убедиться, что все обновлено корректно
      // Это может быть излишним, если renderMissionBtn(true,0) достаточно
      // Но если нужно обновить `row` из базы и запустить полную логику `checkMission`:
      // refreshBtn.click(); // Эмулируем клик для полного обновления состояния (осторожно, может вызвать рекурсию если не управлять состоянием)
      // Или более контролируемый вызов:
      // async () => {
      //   let { data: freshRow } = await supabase.from('user_stats').select('*').eq('tg_id', tgId).maybeSingle();
      //   if (freshRow) await checkMission(freshRow, resDiv, document.getElementById('refreshBtn'));
      // })();

    } else {
      let hours = Math.floor(timer / 3600);
      let minutes = Math.floor((timer % 3600) / 60);
      let secs = timer % 60;
      // Обновляем текст на кнопке, если она есть (она должна быть скрыта renderMissionBtn(false))
      // Вместо этого, можно выводить таймер в promoDiv
      if (promoDiv) promoDiv.innerHTML = `БЗ будет доступна через: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      timer--;
    }
  }, 1000);
}

async function checkMission(row, resDiv, refreshBtn) {
  const promoDiv = document.getElementById('promo');

  // Если миссия не взята (нет времени или целевых боев)
  if (!row.mission_time || row.mission_battles == null) { // Уточнена проверка на null для mission_battles
    renderMissionBtn(true, 0); // Показать кнопку "Получить БЗ"
    if (promoDiv && !row.promo) promoDiv.innerHTML = ''; // Очищаем промо, если его нет и миссия не взята
    return;
  }

  // Если промокод уже выдан и есть время его получения
  if (row.promo && row.promo_time) {
    const now = Date.now();
    const promoReceivedAt = new Date(row.promo_time).getTime();
    const nextMissionAvailableAt = promoReceivedAt + 12 * 60 * 60 * 1000; // 12 часов после получения промо
    const secondsLeft = Math.max(0, Math.floor((nextMissionAvailableAt - now) / 1000));

    renderMissionBtn(false); // Кнопка "Получить БЗ" скрыта, пока действует кулдаун промокода
    if (promoDiv) promoDiv.innerHTML = `<b>Ваш промокод: ${row.promo}</b>`; // Показываем промокод

    if (secondsLeft > 0) {
      renderTimer(row, resDiv, secondsLeft); // Запускаем таймер до доступности следующей БЗ
    } else {
      // Время кулдауна промокода истекло, можно брать новую БЗ
      if (promoDiv) promoDiv.innerHTML += '<br>Время действия промокода истекло. Можно получить новую БЗ.'; // Доп. инфо
      renderMissionBtn(true, 0); // Показать кнопку "Получить БЗ"
      // Можно также сбросить promo и promo_time в БД здесь, если это требуется по логике
      // await supabase.from('user_stats').update({ promo: null, promo_time: null }).eq('tg_id', tgId);
      // row.promo = null; row.promo_time = null; // Обновить локально
    }
  } else if (row.mission_time && row.mission_battles != null) {
    // Миссия взята, но промокода еще нет (ожидаем выполнения БЗ)
    renderMissionBtn(false); // Кнопка "Получить БЗ" скрыта
    if (promoDiv) promoDiv.innerHTML = ''; // Очищаем промо-блок
    // Сообщение о том, что нужно играть бои, выводится в onGetMission и при обновлении (если БЗ активна)
    resDiv.innerHTML = ''; // Очищаем resDiv перед renderUserStat
    renderUserStat(row, resDiv); // Показываем текущую статистику
    resDiv.innerHTML += `<br><b>Боевая задача активна. Цель: ${row.mission_battles} боев. Сыграйте бои и нажмите "Обновить".</b>`;
  } else {
    // Неопределенное состояние, по умолчанию предлагаем взять БЗ
    renderMissionBtn(true, 0);
    if (promoDiv) promoDiv.innerHTML = '';
  }
}
