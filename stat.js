// ВНИМАНИЕ: всегда window.supabase!
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mainBtn').onclick = async () => {
    const nick = document.getElementById('nickname').value.trim();
    const resDiv = document.getElementById('result');
    if (!nick) return alert('Введите ник!');

    // 1. Проверяем, есть ли пользователь в БД
    resDiv.innerHTML = 'Проверяем БД...';
    let { data: row, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError) {
      resDiv.innerHTML = 'Ошибка запроса к БД: ' + fetchError.message;
      return;
    }

    if (row) {
      resDiv.innerHTML = `
        <b>Из БД:</b><br>
        <b>Ник:</b> ${row.nickname}<br>
        <b>Боев:</b> ${row.battles}<br>
        <b>Время:</b> ${row.updated_at}<br>
        <small>TG ID: ${row.tg_id}</small>
      `;
      return;
    }

    // 2. Если нет — получаем из API и сохраняем
    resDiv.innerHTML = 'Получаем статистику из API...';
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

      const { error } = await supabase.from('user_stats').insert([
        { tg_id: tgId, nickname: nick, battles, updated_at }
      ]);
      if (error) {
        resDiv.innerHTML = 'Ошибка сохранения в БД: ' + error.message;
        return;
      }
      resDiv.innerHTML = `
        <b>Сохранено в БД:</b><br>
        <b>Ник:</b> ${nick}<br>
        <b>Боев:</b> ${battles}<br>
        <b>Время:</b> ${updated_at}<br>
        <small>TG ID: ${tgId}</small>
      `;
    } catch (e) {
      resDiv.innerHTML = 'Ошибка при получении статистики!';
    }
  };
});
