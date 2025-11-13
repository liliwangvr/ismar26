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
  const [today, setToday] = useState(new Date())
  const [errorMessage, setErrorMessage] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [isSaving, setIsSaving] = useState(false)


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

      // Handle conference (DDL) node - Fixed to 2026-10-05
      const fixedConferenceDate = new Date('2026-10-05')
      const conferenceNode = {
        id: `${p.id}-conference`,
        name: 'Conference',
        date: fixedConferenceDate
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
      const response = await fetch(`${import.meta.env.BASE_URL}timeline-config.json`)

      if (!response.ok) {
        throw new Error(`Failed to load config file: HTTP ${response.status}`)
      }

      const config = await response.json()
      const loadedPrograms = processConfig(config)
      setPrograms(loadedPrograms)

      // Set today to 15 days before the first event of the first program
      if (loadedPrograms.length > 0 && loadedPrograms[0].timePoints.length > 0) {
        // const firstEventDate = new Date(loadedPrograms[0].timePoints[0].date)
        // const newToday = new Date(firstEventDate)
        // newToday.setDate(newToday.getDate() - 15)
        // setToday(newToday)
        setToday(new Date('2026-03-01'))
      }

      
    } catch (error) {
      console.error('Failed to load config file:', error)
      setErrorMessage(`Load failed: ${error.message}`)
    }
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
    if (isLocked) return // Don't allow changes when locked

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

    programs.forEach((program, programIndex) => {
      // 确保 timePoints 存在
      if (!program.timePoints || !Array.isArray(program.timePoints)) {
        return
      }
      const programColor = COLOR_POOL[programIndex % COLOR_POOL.length]
      
      program.timePoints.forEach(tp => {
        // 处理 date 可能是 Date 对象或字符串的情况
        const dateStr = tp.date instanceof Date ? tp.date.toISOString().split('T')[0] : tp.date

        allRows.push({
          DATE: dateStr,
          EVENT: `${program.name} - ${tp.name}`,
          _color: programColor,
          _order: programIndex
        })
      })
    })

    // 添加 Conference 节点（只添加最后一个/最晚的 conference）
    let latestConference = null
    let conferenceDate = null
    programs.forEach(program => {
      if (program.conference) {
        if (!latestConference || program.conference.date > latestConference.date) {
          latestConference = program.conference
          // 转换为字符串格式
          conferenceDate = latestConference.date instanceof Date 
            ? latestConference.date.toISOString().split('T')[0] 
            : latestConference.date
        }
      }
    })
    
    if (conferenceDate) {
      allRows.push({
        DATE: conferenceDate,
        EVENT: 'Conference',
        _color: '#000000',
        _order: programs.length
      })
    }

    // 按照程序顺序排序（即按 EVENT 分组）
    allRows.sort((a, b) => {
      if (a._order !== b._order) {
        return a._order - b._order
      }
      return new Date(a.DATE) - new Date(b.DATE)
    })

    // 移除用于排序的临时字段
    const exportRows = allRows.map(({ DATE, EVENT }) => ({ DATE, EVENT }))
    
    const worksheet = XLSX.utils.json_to_sheet(exportRows)

    // 应用颜色样式
    allRows.forEach((row, index) => {
      const rowIndex = index + 2;
      
      ['A', 'B'].forEach(col => {
        const cellRef = `${col}${rowIndex}`
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = {
            font: {
              color: { rgb: row._color.replace('#', '') }
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

  // Save current state to GitHub via workflow dispatch
  const saveToGitHub = async () => {
    try {
      setIsSaving(true)
      setErrorMessage('')

      // Get GitHub token from environment variable
      const githubToken = import.meta.env.VITE_GITHUB_TOKEN

      if (!githubToken) {
        throw new Error('GitHub token not configured. Please contact the administrator.')
      }

      // Convert programs back to config format
      const configData = {
        programs: programs.map(p => ({
          id: p.id,
          name: p.name,
          timePoints: p.timePoints.map(tp => ({
            id: tp.id,
            name: tp.name,
            date: tp.date.toISOString().split('T')[0]
          }))
        }))
      }

      // GitHub repository information (you need to update these)
      const owner = 'liliwangvr'  // Replace with your GitHub username
      const repo = 'ismar26'      // Replace with your repository name
      const workflowId = 'update-timeline-config.yml'

      // Trigger workflow dispatch
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',  // or your default branch name
            inputs: {
              config_data: JSON.stringify(configData, null, 2)
            }
          })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        if (response.status === 401) {
          throw new Error('Invalid GitHub token. Please check the VITE_GITHUB_TOKEN in repository secrets.')
        }

        if (response.status === 422) {
          console.error('GitHub API 422 Error details:', errorData)
          throw new Error(
            `GitHub API 422 Error - Possible causes:\n\n` +
            `1. Workflow file not found in repository\n` +
            `   → Make sure '.github/workflows/update-timeline-config.yml' exists in ${owner}/${repo}\n\n` +
            `2. Wrong branch name (currently trying: 'main')\n` +
            `   → Check if your default branch is 'master' instead\n\n` +
            `3. Token missing 'workflow' permission\n` +
            `   → Token needs both 'repo' and 'workflow' scopes\n\n` +
            `Error details: ${errorData.message || 'No additional info'}`
          )
        }

        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }

      alert('✅ Configuration saved successfully!\n\nThe timeline-config.json file will be updated in a moment.\nYou can check the progress in the Actions tab of your GitHub repository.')
      setIsLocked(true)
    } catch (error) {
      console.error('Failed to save to GitHub:', error)
      setErrorMessage(`Save failed: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
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
      <div className="header-container">
        <div className="title-section">
          <h1 className="main-title">Time Deadlines(AoE)</h1>
          <div className="info-icon-wrapper">
            <div className="info-icon">i</div>
            <div className="info-tooltip">
              <div className="tooltip-item">
                <strong>Drag:</strong> Drag red nodes to adjust the date
              </div>
              <div className="tooltip-item">
                <strong>Double-click:</strong> Double-click red nodes to enter a specific date
              </div>
              <div className="tooltip-item">
                <strong>Lock & Save:</strong> Lock the timeline and save to GitHub
              </div>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={loadConfig}>
            Restore
          </button>
          <button className="export-btn" onClick={exportToExcel}>
            Export
          </button>
          {isLocked ? (
            <button className="unlock-btn" onClick={() => setIsLocked(false)}>
              Unlock
            </button>
          ) : (
            <button
              className="lock-btn"
              onClick={saveToGitHub}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Lock & Save'}
            </button>
          )}
        </div>
      </div>

      {/* Error message display */}
      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}

      <div className="timeline-container">
        {programsWithColors.map((program, index) => (
          <TimeLine
            key={program.id}
            program={program}
            today={today}
            color={program.color} // Pass the color to TimeLine
            isLocked={isLocked} // Pass the lock state to TimeLine
            isFirst={index === 0} // Pass whether this is the first program
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

