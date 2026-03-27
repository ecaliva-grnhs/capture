import React, { useState } from 'react'
import { TaskProvider } from './hooks/useTasks'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import TodayView from './components/TodayView'
import WeekView from './components/WeekView'
import RecurringView from './components/RecurringView'
import FocusTimer from './components/FocusTimer'
import TaskModal from './components/TaskModal'

export default function App() {
  const [activeView, setActiveView] = useState('today')
  const [taskModal, setTaskModal] = useState(null)   // null | task object | { isNew, ...defaults }
  const [showFocus, setShowFocus] = useState(false)

  function openAddTask(defaults = {}) {
    setTaskModal({ _new: true, ...defaults })
  }

  function openEditTask(task) {
    setTaskModal(task)
  }

  function closeModal() {
    setTaskModal(null)
  }

  return (
    <TaskProvider>
      <div className="app-shell">
        <Sidebar activeView={activeView} setActiveView={setActiveView} />

        <div className="app-main">
          <Header onAddTask={openAddTask} onFocus={() => setShowFocus(true)} />

          <main className="app-content">
            {activeView === 'today' && (
              <TodayView onEditTask={openEditTask} onAddTask={openAddTask} />
            )}
            {activeView === 'week' && (
              <WeekView onEditTask={openEditTask} onAddTask={openAddTask} />
            )}
            {activeView === 'recurring' && (
              <RecurringView onEditTask={openEditTask} onAddTask={openAddTask} />
            )}
          </main>
        </div>
      </div>

      {taskModal && (
        <TaskModal
          task={taskModal._new ? null : taskModal}
          defaults={taskModal._new ? taskModal : undefined}
          onClose={closeModal}
        />
      )}

      {showFocus && <FocusTimer onClose={() => setShowFocus(false)} />}
    </TaskProvider>
  )
}
