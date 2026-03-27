import React, { useState, useEffect, useRef } from 'react'
import { useTasks } from '../hooks/useTasks'
import { todayStr, isRecurringOn } from '../utils/dates'

const MODES = {
  work:       { label: 'Focus',       duration: 25 * 60, color: '#cba6f7' },
  shortBreak: { label: 'Short Break', duration:  5 * 60, color: '#94e2d5' },
  longBreak:  { label: 'Long Break',  duration: 15 * 60, color: '#89b4fa' },
}

function pad(n) {
  return String(n).padStart(2, '0')
}

export default function FocusTimer({ onClose }) {
  const { tasks } = useTasks()
  const today = todayStr()

  const [mode, setMode] = useState('work')
  const [seconds, setSeconds] = useState(MODES.work.duration)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const intervalRef = useRef(null)

  const currentMode = MODES[mode]
  const pct = 1 - seconds / currentMode.duration
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  const focusTasks = tasks.filter(t => {
    if (t.recurring) return isRecurringOn(t, today)
    return !t.completed && t.dueDate === today
  })

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            handleSessionEnd()
            return 0
          }
          return s - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  function handleSessionEnd() {
    if (mode === 'work') {
      const newSessions = sessions + 1
      setSessions(newSessions)
      const nextMode = newSessions % 4 === 0 ? 'longBreak' : 'shortBreak'
      switchMode(nextMode)
    } else {
      switchMode('work')
    }
  }

  function switchMode(newMode) {
    setMode(newMode)
    setSeconds(MODES[newMode].duration)
    setRunning(false)
  }

  function reset() {
    setRunning(false)
    setSeconds(currentMode.duration)
  }

  // SVG circle progress
  const R = 80
  const circumference = 2 * Math.PI * R
  const dashOffset = circumference * (1 - pct)

  return (
    <div className="focus-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="focus-modal">
        <button className="focus-close" onClick={onClose}>×</button>

        <h2 className="focus-heading">Focus Timer</h2>

        {/* Mode tabs */}
        <div className="focus-modes">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              className={`focus-mode-btn ${mode === key ? 'active' : ''}`}
              style={{ '--mode-color': m.color }}
              onClick={() => switchMode(key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Timer circle */}
        <div className="timer-circle-wrap">
          <svg className="timer-svg" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={R} className="timer-track" />
            <circle
              cx="100" cy="100" r={R}
              className="timer-progress"
              style={{
                stroke: currentMode.color,
                strokeDasharray: circumference,
                strokeDashoffset: dashOffset,
              }}
            />
          </svg>
          <div className="timer-display">
            <span className="timer-time">{pad(mins)}:{pad(secs)}</span>
            <span className="timer-mode-label" style={{ color: currentMode.color }}>
              {currentMode.label}
            </span>
            {sessions > 0 && (
              <span className="timer-sessions">
                {'🍅'.repeat(Math.min(sessions, 8))}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="timer-controls">
          <button className="timer-btn secondary" onClick={reset}>↺</button>
          <button
            className="timer-btn primary"
            style={{ background: currentMode.color }}
            onClick={() => setRunning(r => !r)}
          >
            {running ? '⏸' : '▶'}
          </button>
          <button className="timer-btn secondary" onClick={() => switchMode(mode === 'work' ? 'shortBreak' : 'work')}>
            ⏭
          </button>
        </div>

        {/* Task selector */}
        {focusTasks.length > 0 && (
          <div className="focus-task-select">
            <p className="focus-task-label">Focusing on:</p>
            <div className="focus-task-list">
              {focusTasks.slice(0, 5).map(t => (
                <button
                  key={t.id}
                  className={`focus-task-item ${selectedTaskId === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedTaskId(selectedTaskId === t.id ? null : t.id)}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="focus-tip">
          {mode === 'work'
            ? '🎯 Silence notifications. One task. Full focus.'
            : '☕ Step away from the screen. Breathe.'}
        </p>
      </div>
    </div>
  )
}
