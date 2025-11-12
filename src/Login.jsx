import React, { useState } from 'react';
import './Login.css';

const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 模拟登录延迟
    setTimeout(() => {
      // 使用环境变量，如果没有设置则使用默认值
      const correctPassword = import.meta.env.VITE_AUTH_PASSWORD || 'defaultPassword';
      
      if (password === correctPassword) {
        localStorage.setItem('isAuthenticated', 'true');
        onLogin(true);
      } else {
        setError('密码错误，请重试');
        setPassword('');
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>Time Deadlines (AoE)</h1>
          <p>请输入密码以访问系统</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="password">密码</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              disabled={isLoading}
              autoFocus
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="login-btn"
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? '验证中...' : '登录'}
          </button>
        </form>
        
        <div className="login-footer">
          <small>© 2024 Timeline Demo</small>
        </div>
      </div>
    </div>
  );
};

export default Login;