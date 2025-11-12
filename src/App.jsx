import React, { useState, useEffect, useRef } from 'react'
import TimeLine from './TimeLine'
import Login from './Login'
import './App.css'
import * as XLSX from 'xlsx-js-style'

const COLOR_POOL = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#34495e'
]

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [programs, setPrograms] = useState([])
  const [today] = useState(new Date())
  const [currentAoETime, setCurrentAoETime] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const fileInputRef = useRef(null)

  const getCurrentAoETime = () => {
    const now = new Date()
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const aoeTime = new Date(utc - (12 * 60 * 60 * 1000))

    const year = aoeTime.getFullYear()
    const month = String(aoeTime.getMonth() + 1).padStart(2, '0')
    const day = String(aoeTime.getDate()).padStart(2, '0')
    const hours = String(aoeTime.getHours()).padStart(2, '0')
    const minutes = String(aoeTime.getMinutes()).padStart(2, '0')
    const seconds = String(aoeTime.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  useEffect(() => {
    const updateTime = () => {
      setCurrentAoETime(getCurrentAoETime())
    }

    updateTime()
    const timer = setInterval(updateTime, 1000)

    return () => clearInterval(timer)
  }, [])

  const processConfig = (config) => {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config file format: not a valid JSON object')
    }

    if (!Array.isArray(config.programs)) {
      throw new Error("Invalid config file format: missing 'programs' array")
    }

    if (config.programs.length === 0) {
      throw new Error("Invalid config file format: 'programs' array is empty")
    }

    // DDL gap days (default: 30 days)
    const ddlGapDays = config.ddlGapDays || 30

    const loadedPrograms = config.programs.map((p, index) => {
      // Validate program structure
      if (!p.id || typeof p.id !== 'string') {
        throw new Error(`Program ${index + 1} is missing a valid id field`)
      }
      if (!p.name || typeof p.name !== 'string') {
        throw new Error(`Program "${p.id}" is missing a valid name field`)
      }
      if (!Array.isArray(p.timePoints)) {
        throw new Error(`Program "${p.name}" is missing the timePoints array`)
      }
      if (p.timePoints.length === 0) {
        throw new Error(`Program "${p.name}" has an empty timePoints array`)
      }

      const timePoints = p.timePoints.map((tp, tpIndex) => {
        // Validate timePoint structure
        if (!tp.id || typeof tp.id !== 'string') {
          throw new Error(`Program "${p.name}" TimePoint ${tpIndex + 1} is missing a valid id field`)
        }
        if (!tp.name || typeof tp.name !== 'string') {
          throw new Error(`Program "${p.name}" TimePoint "${tp.id}" is missing a valid name field`)
        }
        if (!tp.date) {
          throw new Error(`Program "${p.name}" TimePoint "${tp.name}" is missing the date field`)
        }

        // Validate date format
        const date = new Date(tp.date)
        if (isNaN(date.getTime())) {
          throw new Error(`Program "${p.name}" TimePoint "${tp.name}" has invalid date format: "${tp.date}"`)
        }

        return {
          ...tp,
          date: date
        }
      })

      // Handle conference (DDL) node
      let conferenceNode = null
      if (p.conference) {
        if (!p.conference.name || typeof p.conference.name !== 'string') {
          throw new Error(`Program "${p.name}" conference is missing a valid name field`)
        }
        if (!p.conference.date) {
          throw new Error(`Program "${p.name}" conference is missing the date field`)
        }

        const conferenceDate = new Date(p.conference.date)
        if (isNaN(conferenceDate.getTime())) {
          throw new Error(`Program "${p.name}" conference has invalid date format: "${p.conference.date}"`)
        }

        conferenceNode = {
          id: `${p.id}-conference`,
          name: p.conference.name,
          date: conferenceDate
        }
      } else {
        // If no conference field, automatically compute DDL
        if (timePoints.length > 0) {
          const lastDate = new Date(timePoints[timePoints.length - 1].date)
          const autoDDL = new Date(lastDate)
          autoDDL.setDate(autoDDL.getDate() + ddlGapDays)

          conferenceNode = {
            id: `${p.id}-conference`,
            name: 'Conference',
            date: autoDDL
          }
        }
      }

      return {
        ...p,
        ddl: conferenceNode ? conferenceNode.date : null,
        conference: conferenceNode,
        timePoints
      }
    })

    return loadedPrograms
  }

  // Load data from the default config file
  const loadConfig = async () => {
    try {
      setErrorMessage('')
      const response = await fetch('/timeline-config.json')

      if (!response.ok) {
        throw new Error(`Failed to load config file: HTTP ${response.status}`)
      }

      const config = await response.json()
      const loadedPrograms = processConfig(config)
      setPrograms(loadedPrograms)
    } catch (error) {
      console.error('Failed to load config file:', error)
      setErrorMessage(`Load failed: ${error.message}`)
    }
  }

  // Import data from Excel
  const handleExcelUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    setErrorMessage('')
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

  // Read the first worksheet
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  // Convert worksheet to JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet)

        if (!jsonData || jsonData.length === 0) {
          throw new Error('Excel file is empty or has invalid format')
        }

        // Validate required columns
        const firstRow = jsonData[0]
        if (!firstRow.DATE || !firstRow.EVENT) {
          throw new Error('Excel file must contain DATE and EVENT columns')
        }

  // Group rows by program (process in order)
  const programsMap = new Map()
        let currentProgramName = null

        jsonData.forEach((row, index) => {
          if (!row.DATE || !row.EVENT) {
            console.warn(`Skipping row ${index + 2}: missing required fields`)
            return
          }

          // Parse date
          const date = new Date(row.DATE)
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format on row ${index + 2}: "${row.DATE}"`)
          }

          // Check if this is a Conference row
          if (row.EVENT.trim() === 'Conference') {
            // This is a conference row and belongs to the current program
            if (!currentProgramName) {
              throw new Error(`Row ${index + 2} is Conference but has no corresponding Program`)
            }

            programsMap.get(currentProgramName).conference = {
              id: `${currentProgramName.toLowerCase().replace(/\s+/g, '-')}-conference`,
              name: 'Conference',
              date: date
            }
          } else {
            // Parse EVENT field: format is "ProgramName - EventName"
            const eventParts = row.EVENT.split(' - ')
            if (eventParts.length < 2) {
              throw new Error(`Invalid EVENT format on row ${index + 2}; expected "ProgramName - EventName" or "Conference"`)
            }

            const programName = eventParts[0].trim()
            const eventName = eventParts.slice(1).join(' - ').trim()

            // Update current program
            currentProgramName = programName

            // Add to the corresponding program
            if (!programsMap.has(programName)) {
              programsMap.set(programName, { events: [], conference: null })
            }

            // This is a regular event
            programsMap.get(programName).events.push({
              id: `${programName.toLowerCase().replace(/\s+/g, '-')}-${index}`,
              name: eventName,
              date: date
            })
          }
        })

        // Convert to the format required by the app
        const loadedPrograms = Array.from(programsMap.entries()).map(([programName, data], index) => {
          // Sort timePoints by date
          data.events.sort((a, b) => a.date - b.date)

          let conferenceNode = data.conference

          // If there is no conference node, auto-compute the DDL
          if (!conferenceNode && data.events.length > 0) {
            const lastDate = new Date(data.events[data.events.length - 1].date)
            const autoDDL = new Date(lastDate)
            autoDDL.setDate(autoDDL.getDate() + 30)

            conferenceNode = {
              id: `${programName.toLowerCase().replace(/\s+/g, '-')}-conference`,
              name: 'Conference',
              date: autoDDL
            }
          }

          return {
            id: programName.toLowerCase().replace(/\s+/g, '-'),
            name: programName,
            timePoints: data.events,
            conference: conferenceNode,
            ddl: conferenceNode ? conferenceNode.date : null
          }
        })

        setPrograms(loadedPrograms)
        } catch (error) {
        console.error('Excel parsing failed:', error)
        setErrorMessage(`Excel parsing failed: ${error.message}`)
      }
    }

    reader.onerror = () => {
      setErrorMessage('File read failed, please try again')
    }

    reader.readAsArrayBuffer(file)
  }

  // Trigger file input
  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  // Initial load
  useEffect(() => {
    loadConfig()
  }, [])

  // 检查登录状态
  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated')
    setIsAuthenticated(authStatus === 'true')
    setIsLoading(false)
  }, [])

  // 登录处理
  const handleLogin = (status) => {
    setIsAuthenticated(status)
  }

  // 登出处理
  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    setIsAuthenticated(false)
  }

  // Update the date of a time point
  const updateTimePointDate = (programId, timePointId, newDate) => {
    setPrograms(programs.map(p => {
      if (p.id === programId) {
        return {
          ...p,
          timePoints: p.timePoints.map(tp =>
            tp.id === timePointId ? { ...tp, date: newDate } : tp
          )
        }
      }
      return p
    }))
  }

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new()
    let allRows = []

    programs.forEach(program => {
      program.timePoints.forEach(tp => {
        const programColor = COLOR_POOL[programs.indexOf(program) % COLOR_POOL.length]
        const eventDate = new Date(`${tp.date}T23:59:59`)
        const now = new Date()
        const timeDiff = eventDate - now
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24))

        allRows.push({
          Program: program.name,
          Event: tp.name,
          Date: tp.date,
          'Days Remaining': daysRemaining > 0 ? daysRemaining : 'Past Due',
          Color: programColor
        })
      })
    })

    // 添加 Conference 节点（只添加一次）
    const conferenceEventDate = new Date(`${conferenceDate}T23:59:59`)
    const now = new Date()
    const conferenceDaysRemaining = Math.ceil((conferenceEventDate - now) / (1000 * 60 * 60 * 24))

    allRows.push({
      Program: 'Conference',
      Event: 'Conference',
      Date: conferenceDate,
      'Days Remaining': conferenceDaysRemaining > 0 ? conferenceDaysRemaining : 'Past Due',
      Color: '#000000'
    })

    allRows.sort((a, b) => new Date(a.Date) - new Date(b.Date))

    const worksheet = XLSX.utils.json_to_sheet(allRows)

    allRows.forEach((row, index) => {
      const rowIndex = index + 2
      const cellAddress = `A${rowIndex}:E${rowIndex}`

      if (!worksheet['!rows']) worksheet['!rows'] = []
      if (!worksheet['!rows'][index + 1]) worksheet['!rows'][index + 1] = {}

      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        const cellRef = `${col}${rowIndex}`
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = {
            font: {
              color: { rgb: row.Color.replace('#', '') }
            }
          }
        }
      })
    })

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timeline')
    XLSX.writeFile(workbook, 'timeline_export.xlsx')
  }

  const refreshPage = () => {
    window.location.reload()
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  // 未登录状态
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  const formatCurrentTime = (time) => {
    return time.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Shanghai'
    })
  }

  // Assign colors to programs
  const programsWithColors = programs.map((program, index) => ({
    ...program,
    color: COLOR_POOL[index % COLOR_POOL.length].replace('#', '')
  }))

  return (
    <div className="app">
      <div className="title-container">
        <h1 className="main-title">Time Deadlines (AoE)</h1>        <div className="info-icon-wrapper">
          <span className="info-icon">i</span>
          <div className="info-tooltip">
            <div className="tooltip-item">
              drag or double-click to adjust date
            </div>
          </div>
        </div>
      </div>
      
      <div className="controls-container">
        <div className="header-actions">
          <button className="refresh-btn" onClick={loadConfig}>
            Back to default
          </button>
          <button className="refresh-btn" onClick={triggerFileInput}>
            Import Excel
          </button>
          <button onClick={exportToExcel} className="export-btn">
            Export Excel
          </button>
        </div>

      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleExcelUpload}
        style={{ display: 'none' }}
      />

      {/* Error message display */}
      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}

      <div className="today-info">
        <strong>Current AoE Time:</strong>{' '}
        <span className="date">{currentAoETime}</span>
      </div>

      <div className="timeline-container">
        {programsWithColors.map((program) => (
          <TimeLine
            key={program.id}
            program={program}
            today={today}
            color={program.color}
            onTimePointChange={(timePointId, newDate) =>
              updateTimePointDate(program.id, timePointId, newDate)
            }
          />
        ))}
      </div>
    </div>
  )
}

export default App
