export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const CATEGORIES = {
  work:      { label: 'Work',      color: '#cba6f7' },
  admin:     { label: 'Admin',     color: '#89b4fa' },
  finance:   { label: 'Finance',   color: '#a6e3a1' },
  marketing: { label: 'Marketing', color: '#f5c2e7' },
  client:    { label: 'Client',    color: '#f9e2af' },
  personal:  { label: 'Personal',  color: '#fab387' },
  health:    { label: 'Health',    color: '#94e2d5' },
}

export const PRIORITIES = {
  high:   { label: 'High',   color: '#f38ba8' },
  medium: { label: 'Medium', color: '#f9e2af' },
  low:    { label: 'Low',    color: '#6c7086' },
}

export const RECURRENCE_OPTIONS = [
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly',   label: 'Weekly (pick days)' },
  { value: 'monthly',  label: 'Monthly (pick day)' },
]

/** Returns today's date as YYYY-MM-DD */
export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

/** Returns an array of 7 YYYY-MM-DD strings for the current week (Mon–Sun) */
export function getWeekDays() {
  const days = []
  const now = new Date()
  const dow = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  monday.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

/** True if a recurring task should appear on the given date string */
export function isRecurringOn(task, dateStr) {
  if (!task.recurring) return false
  const date = new Date(dateStr + 'T12:00:00')
  const dow = date.getDay() // 0=Sun
  if (task.recurring === 'daily') return true
  if (task.recurring === 'weekdays') return dow >= 1 && dow <= 5
  if (task.recurring === 'weekly') return (task.recurringDays || []).includes(dow)
  if (task.recurring === 'monthly') return (task.recurringDays || []).includes(date.getDate())
  return false
}

/** True if task was completed on the given date */
export function isCompletedOn(task, dateStr) {
  if (task.recurring) return (task.completedDates || []).includes(dateStr)
  return task.completed && task.dueDate === dateStr
}

/** Returns the current streak for a recurring task (consecutive completed days) */
export function getStreak(task) {
  if (!task.recurring) return 0
  const completed = new Set(task.completedDates || [])
  let streak = 0
  const now = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    if (!isRecurringOn(task, ds)) continue
    if (!completed.has(ds)) break
    streak++
  }
  return streak
}

/** Human-readable date like "Mon, Mar 27" */
export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Monday", "Tuesday" etc from date string */
export function dayOfWeekName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return DAYS_FULL[d.getDay()]
}

/** True if dateStr is before today */
export function isOverdue(dateStr) {
  return dateStr < todayStr()
}

/** Relative label: "Today", "Tomorrow", "Mon Mar 24", "3 days ago" */
export function relativeDate(dateStr) {
  const today = todayStr()
  if (dateStr === today) return 'Today'
  const diff = Math.round(
    (new Date(dateStr + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000
  )
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return formatDate(dateStr)
  if (diff < 0) return `${Math.abs(diff)} days overdue`
  return formatDate(dateStr)
}
