const cron = require('node-cron')
const axios = require('axios')

const AGNO_URL = process.env.AGNO_API_URL || 'http://agno:8000'
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN

function startCronJobs() {
  // Check reminders every minute
  cron.schedule('* * * * *', async () => {
    try {
      const res = await axios.get(`${AGNO_URL}/reminders/pending`)
      const reminders = res.data?.data || []

      for (const r of reminders) {
        try {
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: r.telegram_id,
            text: `⏰ *Nhắc nhở:*\n\n${escapeMd(r.content)}`,
            parse_mode: 'Markdown'
          })
          await axios.post(`${AGNO_URL}/reminders/${r.id}/notify`)
          console.log(`Reminder sent: ${r.id}`)
        } catch (e) {
          console.error(`Reminder ${r.id} failed:`, e.message)
        }
      }
    } catch (e) {
      // Silent fail - no reminders or Agno down
    }
  })

  // Daily briefing at 07:00
  cron.schedule('0 7 * * *', async () => {
    console.log('Running daily briefing...')
    try {
      // Get pending memory count
      const memRes = await axios.get(`${AGNO_URL}/memory?status=pending&limit=1`)
      const pendingCount = memRes.data?.data?.length || 0

      // Get today's reminders
      const remRes = await axios.get(`${AGNO_URL}/reminders/pending`)
      const todayReminders = remRes.data?.data || []

      // Only send if there's something noteworthy
      if (pendingCount > 0 || todayReminders.length > 0) {
        const briefing = [
          `🌅 *Chào buổi sáng!*`,
          ``,
          pendingCount > 0 ? `📝 *${pendingCount}* memory đang chờ duyệt` : '',
          todayReminders.length > 0 ? `⏰ *${todayReminders.length}* nhắc nhở hôm nay` : '',
          ``,
          `Dùng /mem để duyệt memory, /ask để hỏi.`
        ].filter(Boolean).join('\n')

        // Send to user (hardcoded for now, multi-user later)
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: 5250339472,
          text: briefing,
          parse_mode: 'Markdown'
        })
        console.log('Daily briefing sent')
      }
    } catch (e) {
      console.error('Briefing error:', e.message)
    }
  })

  console.log('Cron jobs started: reminder check (every min), daily briefing (07:00)')
}

function escapeMd(text) {
  return (text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

module.exports = { startCronJobs }
