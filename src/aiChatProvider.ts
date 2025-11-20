import * as vscode from 'vscode';
import { AiService, ChatMessage } from './aiService';

export class AiChatProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiChatView';
    private _view?: vscode.WebviewView;
    private aiService: AiService;
    private chatHistory: ChatMessage[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.aiService = new AiService();
        this.loadChatHistory();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 发送初始数据
        this.updateWebview();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleSendMessage(data.message);
                    break;
                case 'clearHistory':
                    this.clearHistory();
                    break;
                case 'configureSettings':
                    this.configureSettings();
                    break;
                case 'requestHistory':
                    this.updateWebview();
                    break;
                case 'toggleTools':
                    await this.toggleTools(data.enabled);
                    break;
            }
        });

        // 当视图可见时，确保更新内容
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateWebview();
            }
        });
    }

    private async handleSendMessage(message: string) {
        if (!this._view) {
            return;
        }

        const userMessage: ChatMessage = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };

        this.chatHistory.push(userMessage);
        this.saveChatHistory();
        this.updateWebview();

        try {
            // 创建一个空的助手消息用于流式更新
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: '',
                timestamp: Date.now()
            };

            this.chatHistory.push(assistantMessage);
            this.saveChatHistory();
            
            // 显示思考状态
            if (this._view) {
                this._view.webview.postMessage({ 
                    type: 'streamStart',
                    messageId: this.chatHistory.length - 1 
                });
            }

            const config = this.aiService.getConfig();

            if (config.enableStream) {
                // 使用流式响应
                await this.aiService.sendMessageStream(this.chatHistory.slice(0, -1), (chunk) => {
                    if (chunk.done) {
                        if (this._view) {
                            this._view.webview.postMessage({ 
                                type: 'streamEnd',
                                messageId: this.chatHistory.length - 1 
                            });
                        }
                    } else {
                        if (this._view) {
                            this._view.webview.postMessage({ 
                                type: 'streamChunk',
                                messageId: this.chatHistory.length - 1,
                                content: chunk.content 
                            });
                        }
                        
                        // 更新本地消息内容
                        this.chatHistory[this.chatHistory.length - 1].content += chunk.content;
                    }
                });
            } else {
                // 使用普通响应
                this._view.webview.postMessage({ type: 'thinking' });
                
                const response = await this.aiService.sendMessage(this.chatHistory.slice(0, -1));
                
                this.chatHistory[this.chatHistory.length - 1].content = response;
                
                if (this._view) {
                    this._view.webview.postMessage({ 
                        type: 'streamEnd',
                        messageId: this.chatHistory.length - 1 
                    });
                }
            }

            this.saveChatHistory();
            this.updateWebview();
        } catch (error: any) {
            this._view.webview.postMessage({
                type: 'error',
                message: error.message || '发送消息时出错'
            });
        }
    }

    private updateWebview() {
        if (this._view) {
            const config = this.aiService.getConfig();
            this._view.webview.postMessage({
                type: 'updateHistory',
                history: this.chatHistory,
                toolsEnabled: config.enableTools
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // 获取marked库的本地资源URI
        const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'marked', 'marked.min.js'));
        
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI对话助手</title>
    <script src="${markedUri}"></script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 8px;
            height: 99vh;
            overflow-y: hidden;
            display: flex;
            flex-direction: column;
        }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 8px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
        }
        
        .message {
            margin-bottom: 12px;
            padding: 6px 8px;
            border-radius: 6px;
            word-wrap: break-word;
        }
        
        .user-message {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: 10%;
        }
        
        .assistant-message {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            margin-right: 10%;
        }
        
        .message-role {
            font-weight: bold;
            margin-bottom: 2px;
            font-size: 0.8em;
            opacity: 0.8;
        }
        
        .input-container {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
        }
        
        #messageInput {
            flex: 1;
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }
        
        #messageInput:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        
        .button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            white-space: nowrap;
        }
        
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .button-small {
            padding: 4px 8px;
            font-size: 0.85em;
        }
        
        .toolbar {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .switch-container {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-right: 8px;
        }
        
        .switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 20px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-button-secondaryBackground);
            transition: .4s;
            border-radius: 20px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: var(--vscode-button-background);
        }
        
        input:checked + .slider:before {
            transform: translateX(20px);
        }
        
        .switch-label {
            font-size: 0.85em;
            color: var(--vscode-foreground);
        }
        
        .thinking {
            font-style: italic;
            opacity: 0.7;
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 6px;
            border-radius: 4px;
            margin-bottom: 8px;
            font-size: 0.9em;
        }
        
        .pre {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            line-height: 1.4;
        }
        
        .markdown-content {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            line-height: 1.5;
        }
        
        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3,
        .markdown-content h4,
        .markdown-content h5,
        .markdown-content h6 {
            margin-top: 16px;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        
        .markdown-content h1 { font-size: 1.5em; }
        .markdown-content h2 { font-size: 1.3em; }
        .markdown-content h3 { font-size: 1.1em; }
        
        .markdown-content p {
            margin: 8px 0;
        }
        
        .markdown-content code {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }
        
        .markdown-content pre {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            padding: 8px;
            overflow-x: auto;
            margin: 8px 0;
        }
        
        .markdown-content pre code {
            background-color: transparent;
            padding: 0;
            border-radius: 0;
        }
        
        .markdown-content ul,
        .markdown-content ol {
            margin: 8px 0;
            padding-left: 20px;
        }
        
        .markdown-content li {
            margin: 4px 0;
        }
        
        .markdown-content blockquote {
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            background-color: var(--vscode-textBlockQuote-background);
            padding: 8px 12px;
            margin: 8px 0;
            font-style: italic;
        }
        
        .markdown-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 8px 0;
        }
        
        .markdown-content th,
        .markdown-content td {
            border: 1px solid var(--vscode-panel-border);
            padding: 6px 8px;
            text-align: left;
        }
        
        .markdown-content th {
            background-color: var(--vscode-textBlockQuote-background);
            font-weight: bold;
        }
        
        .markdown-content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        
        .markdown-content a:hover {
            text-decoration: underline;
        }
        
        .markdown-content strong {
            font-weight: bold;
        }
        
        .markdown-content em {
            font-style: italic;
        }
        
        .streaming {
            position: relative;
        }
        
        .streaming::after {
            content: '▊';
            animation: blink 1s infinite;
            color: var(--vscode-editor-foreground);
            opacity: 0.8;
        }
        
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
        
        .header {
            text-align: center;
            font-weight: bold;
            margin-bottom: 8px;
            padding: 8px;
            background-color: var(--vscode-panel-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chatContainer"></div>
    
    <div class="toolbar">
        <div class="switch-container">
            <label class="switch">
                <input type="checkbox" id="toolsSwitch" checked onchange="toggleTools()">
                <span class="slider"></span>
            </label>
            <span class="switch-label">Agent模式(此模式会读取并修改代码)</span>
        </div>
    </div>
    
    <div class="input-container">
        <input type="text" id="messageInput" placeholder="输入消息..." onkeypress="handleKeyPress(event)">
        <button class="button" onclick="sendMessage()">发送</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (message) {
                vscode.postMessage({
                    type: 'sendMessage',
                    message: message
                });
                input.value = '';
            }
        }
        
        function handleKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }
        
        function clearHistory() {
            vscode.postMessage({ type: 'clearHistory' });
        }
        
        function configureSettings() {
            vscode.postMessage({ type: 'configureSettings' });
        }
        
        function toggleTools() {
            const toolsSwitch = document.getElementById('toolsSwitch');
            vscode.postMessage({
                type: 'toggleTools',
                enabled: toolsSwitch.checked
            });
        }
        
        function updateChatHistory(history) {
            const container = document.getElementById('chatContainer');
            container.innerHTML = '';
            
            if (history.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.style.textAlign = 'center';
                emptyDiv.style.opacity = '0.6';
                emptyDiv.style.padding = '20px';
                emptyDiv.textContent = '暂无对话记录，开始与AI助手对话吧！';
                container.appendChild(emptyDiv);
                return;
            }
            
            history.forEach((msg, index) => {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (msg.role === 'user' ? 'user-message' : 'assistant-message');
                messageDiv.setAttribute('data-message-id', index);
                
                const roleDiv = document.createElement('div');
                roleDiv.className = 'message-role';
                roleDiv.textContent = msg.role === 'user' ? '用户' : 'AI助手';
                
                const contentDiv = document.createElement('div');
                if (msg.role === 'user') {
                    // 用户消息使用纯文本显示
                    contentDiv.className = 'pre';
                    contentDiv.textContent = msg.content;
                } else {
                    // AI助手消息使用Markdown渲染
                    contentDiv.className = 'markdown-content';
                    contentDiv.innerHTML = marked.parse(msg.content);
                }
                contentDiv.setAttribute('data-message-content', index);
                
                messageDiv.appendChild(roleDiv);
                messageDiv.appendChild(contentDiv);
                container.appendChild(messageDiv);
            });
            
            container.scrollTop = container.scrollHeight;
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'updateHistory':
                    updateChatHistory(message.history);
                    // 同步工具开关状态
                    if (message.toolsEnabled !== undefined) {
                        const toolsSwitch = document.getElementById('toolsSwitch');
                        if (toolsSwitch && toolsSwitch.checked !== message.toolsEnabled) {
                            toolsSwitch.checked = message.toolsEnabled;
                        }
                    }
                    break;
                case 'streamStart':
                    // 创建流式消息容器
                    const streamDiv = document.createElement('div');
                    streamDiv.className = 'message assistant-message';
                    streamDiv.setAttribute('data-message-id', message.messageId);
                    
                    const streamRoleDiv = document.createElement('div');
                    streamRoleDiv.className = 'message-role';
                    streamRoleDiv.textContent = 'AI助手';
                    
                    const streamContentDiv = document.createElement('div');
                    streamContentDiv.className = 'markdown-content streaming';
                    streamContentDiv.setAttribute('data-message-content', message.messageId);
                    streamContentDiv.textContent = '';
                    
                    streamDiv.appendChild(streamRoleDiv);
                    streamDiv.appendChild(streamContentDiv);
                    document.getElementById('chatContainer').appendChild(streamDiv);
                    streamDiv.scrollIntoView();
                    break;
                    
                case 'streamChunk':
                    // 更新流式内容
                    const contentElement = document.querySelector('[data-message-content="' + message.messageId + '"]');
                    if (contentElement) {
                        // 获取当前内容并添加新内容
                        const currentContent = contentElement.textContent || '';
                        const newContent = currentContent + message.content;
                        
                        // 渲染Markdown
                        try {
                            contentElement.innerHTML = marked.parse(newContent);
                        } catch (e) {
                            // 如果Markdown解析失败，回退到纯文本
                            contentElement.textContent = newContent;
                        }
                        
                        contentElement.parentElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                    break;
                    
                case 'streamEnd':
                    // 流式结束，移除streaming样式
                    const finishedElement = document.querySelector('[data-message-content="' + message.messageId + '"]');
                    if (finishedElement) {
                        finishedElement.classList.remove('streaming');
                    }
                    break;
                    
                case 'thinking':
                    const thinkingDiv = document.createElement('div');
                    thinkingDiv.className = 'message assistant-message thinking';
                    thinkingDiv.innerHTML = '<div class="message-role">AI助手</div><div>正在思考中...</div>';
                    document.getElementById('chatContainer').appendChild(thinkingDiv);
                    thinkingDiv.scrollIntoView();
                    break;
                case 'error':
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error';
                    errorDiv.textContent = message.message;
                    document.getElementById('chatContainer').appendChild(errorDiv);
                    errorDiv.scrollIntoView();
                    break;
                case 'status':
                    const statusDiv = document.createElement('div');
                    statusDiv.style.cssText = 'background-color: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-textBlockQuote-border); padding: 6px; border-radius: 4px; margin-bottom: 8px; font-size: 0.9em; color: var(--vscode-foreground);';
                    statusDiv.textContent = message.message;
                    document.getElementById('chatContainer').appendChild(statusDiv);
                    statusDiv.scrollIntoView();
                    // 3秒后自动移除状态消息
                    setTimeout(() => {
                        if (statusDiv.parentNode) {
                            statusDiv.parentNode.removeChild(statusDiv);
                        }
                    }, 3000);
                    break;
            }
        });
        
        // 请求初始数据
        vscode.postMessage({ type: 'requestHistory' });
    </script>
</body>
</html>`;
    }

    public show() {
        if (this._view) {
            this._view.show();
        }
    }

    public configureSettings() {
        vscode.commands.executeCommand('workbench.action.openSettings', 'aiChat');
    }

    public clearHistory() {
        this.chatHistory = [];
        this.saveChatHistory();
        this.updateWebview();
    }

    public async toggleTools(enabled: boolean) {
        const config = vscode.workspace.getConfiguration('aiChat');
        await config.update('enableTools', enabled, vscode.ConfigurationTarget.Global);
        this.aiService = new AiService(); // 重新创建服务实例以使用新配置
        
        // 显示状态提示
        if (this._view) {
            const statusMessage = enabled ? '工具调用已启用' : '工具调用已禁用';
            this._view.webview.postMessage({
                type: 'status',
                message: statusMessage
            });
        }
    }

    private loadChatHistory() {
        const history = this.context.globalState.get<ChatMessage[]>('chatHistory', []);
        this.chatHistory = history;
    }

    private saveChatHistory() {
        this.context.globalState.update('chatHistory', this.chatHistory);
    }

    public dispose() {
        // 清理资源
    }
}