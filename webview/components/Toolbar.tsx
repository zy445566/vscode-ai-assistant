import React, { useState } from 'react';
import { McpServerInfo } from '../types';

interface ToolbarProps {
    toolsEnabled: boolean;
    onToggleTools: (enabled: boolean) => void;
    allMcpServers?: McpServerInfo[];
    selectedMcpServers?: string[];
    onMcpSelectionChange?: (servers: string[]) => void;
    onReconnectServer?: (serverName: string) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ 
    toolsEnabled, 
    onToggleTools,
    allMcpServers = [],
    selectedMcpServers = [],
    onMcpSelectionChange,
    onReconnectServer
}) => {
    const [mcpServerInfos, setMcpServerInfos] = useState<McpServerInfo[]>(allMcpServers);

    React.useEffect(() => {
        setMcpServerInfos(allMcpServers);
    }, [allMcpServers]);

    const handleMcpToggle = (serverName: string, checked: boolean) => {
        let newSelection: string[];
        if (checked) {
            newSelection = [...selectedMcpServers, serverName];
        } else {
            newSelection = selectedMcpServers.filter(name => name !== serverName);
        }
        onMcpSelectionChange?.(newSelection);
    };

    const handleConnect = (serverName: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onReconnectServer?.(serverName);
    };

    const handleSelectAll = () => {
        const connectedServers = mcpServerInfos
            .filter(info => info.connected)
            .map(info => info.name);
        onMcpSelectionChange?.(connectedServers);
    };

    const handleConnectAll = () => {
        // 连接所有未连接的服务器
        const disconnectedServers = mcpServerInfos
            .filter(info => !info.connected)
            .map(info => info.name);
        
        // 逐个连接服务器
        disconnectedServers.forEach(serverName => {
            onReconnectServer?.(serverName);
        });
    };

    const handleDeselectAll = () => {
        onMcpSelectionChange?.([]);
    };

    return (
        <div className="toolbar">
            <div className="switch-container">
                <label className="switch">
                    <input
                        type="checkbox"
                        checked={toolsEnabled}
                        onChange={(e) => onToggleTools(e.target.checked)}
                    />
                    <span className="slider"></span>
                </label>
                <span className="switch-label">Agent模式(如果模型支持则可能会读取并修改代码)</span>
            </div>
            
            {toolsEnabled && mcpServerInfos.length > 0 && (
                <div className="mcp-selector">
                    <div className="mcp-header">
                        <span className="mcp-label">MCP服务:</span>
                        <div className="mcp-actions">
                            <button 
                                className="mcp-action-button"
                                onClick={handleConnectAll}
                                title="连接所有未连接的服务"
                            >
                                连接全部
                            </button>
                            <button 
                                className="mcp-action-button"
                                onClick={handleSelectAll}
                                title="选择所有已连接的服务"
                            >
                                全选
                            </button>
                            <button 
                                className="mcp-action-button"
                                onClick={handleDeselectAll}
                                title="取消选择所有服务"
                            >
                                全不选
                            </button>
                        </div>
                    </div>
                    <div className="mcp-list">
                        {mcpServerInfos.map((serverInfo) => {
                            const isConnected = serverInfo.connected;
                            const isSelected = selectedMcpServers.includes(serverInfo.name);
                            
                            return (
                                <div key={serverInfo.name} className="mcp-item">
                                    <label className={`mcp-checkbox-label ${!isConnected ? 'disabled' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            disabled={!isConnected}
                                            onChange={(e) => handleMcpToggle(serverInfo.name, e.target.checked)}
                                        />
                                        <span className={`mcp-server-name ${isConnected ? 'connected' : 'disconnected'}`}>
                                            {serverInfo.name}
                                        </span>
                                        {!isConnected && (
                                            <span className="mcp-status-indicator disconnected">未连接</span>
                                        )}
                                        {isConnected && (
                                            <span className="mcp-status-indicator connected">已连接</span>
                                        )}
                                    </label>
                                    {!isConnected && (
                                        <button 
                                            className="mcp-reconnect-button"
                                            onClick={(e) => handleConnect(serverInfo.name, e)}
                                            title="连接此服务器"
                                        >
                                            连接
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};