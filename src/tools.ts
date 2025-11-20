import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// 工具方法实现
export const toolHandlers = {
    getProjectPath: async (): Promise<string> => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.toString();
        }
        throw new Error('没有打开的工作区');
    },
    getCurrentFilePath: async (): Promise<string> => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document) {
            return activeEditor.document.uri.toString();
        }
        throw new Error('没有打开的文件');
    },

    getAllOpenFiles: async (): Promise<string[]> => {
        const openFiles: string[] = [];
        vscode.workspace.textDocuments.forEach(doc => {
            if (!doc.isUntitled) {
                openFiles.push(doc.uri.toString());
            }
        });
        return openFiles;
    },

    getCurrentSelection: async (): Promise<{ start: number; end: number; text: string; line: number }> => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('没有活动的编辑器');
        }
        
        const selection = activeEditor.selection;
        const document = activeEditor.document;
        const selectedText = document.getText(selection);
        
        return {
            start: selection.start.character,
            end: selection.end.character,
            text: selectedText,
            line: selection.start.line
        };
    },

    getCurrentLineContent: async (): Promise<string> => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('没有活动的编辑器');
        }
        
        const line = activeEditor.selection.active.line;
        return activeEditor.document.lineAt(line).text;
    },

    getCursorInfo: async (): Promise<{ line: number; column: number; totalLines: number }> => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('没有活动的编辑器');
        }
        
        const position = activeEditor.selection.active;
        const document = activeEditor.document;
        
        return {
            line: position.line,
            column: position.character,
            totalLines: document.lineCount
        };
    },

    openFileToEdit: async (params: { uri: string }): Promise<string> => {
        try {
            const uri = vscode.Uri.parse(params.uri);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
            return `文件已打开: ${params.uri}`;
        } catch (error) {
            throw new Error(`打开文件失败: ${error}`);
        }
    },

    // vscode.workspace.fs 方法实现
    fsReadFile: async (params: { uri: string }): Promise<string> => {
        try {
            const uri = vscode.Uri.parse(params.uri);
            const uint8Array = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder().decode(uint8Array);
        } catch (error) {
            throw new Error(`VSCode FS 读取文件失败: ${error}`);
        }
    },

    fsWriteFile: async (params: { uri: string; content: string }): Promise<string> => {
        try {
            // 询问用户是否确认修改
            const answer = await vscode.window.showQuickPick(['是', '否'], {
                placeHolder: `确定要修改文件 ${params.uri} 吗？`
            });
            
            if (answer !== '是') {
                throw new Error('用户拒绝修改');
            }

            const uri = vscode.Uri.parse(params.uri);
            const uint8Array = new TextEncoder().encode(params.content);
            await vscode.workspace.fs.writeFile(uri, uint8Array);
            return `VSCode FS 文件已成功写入: ${params.uri}`;
        } catch (error) {
            throw new Error(`VSCode FS 写入文件失败: ${error}`);
        }
    },

    fsDelete: async (params: { uri: string; recursive?: boolean }): Promise<string> => {
        try {
            // 询问用户是否确认删除
            const answer = await vscode.window.showQuickPick(['是', '否'], {
                placeHolder: `确定要删除 ${params.uri} 吗？`
            });
            
            if (answer !== '是') {
                throw new Error('用户拒绝删除');
            }

            const uri = vscode.Uri.parse(params.uri);
            const options = { recursive: params.recursive || false };
            await vscode.workspace.fs.delete(uri, options);
            return `VSCode FS 文件/目录已成功删除: ${params.uri}`;
        } catch (error) {
            throw new Error(`VSCode FS 删除失败: ${error}`);
        }
    },

    fsRename: async (params: { oldUri: string; newUri: string }): Promise<string> => {
        try {
            const oldUri = vscode.Uri.parse(params.oldUri);
            const newUri = vscode.Uri.parse(params.newUri);
            await vscode.workspace.fs.rename(oldUri, newUri);
            return `VScode FS 文件/目录已成功重命名: ${params.oldUri} -> ${params.newUri}`;
        } catch (error) {
            throw new Error(`VSCode FS 重命名失败: ${error}`);
        }
    },

    fsCreateDirectory: async (params: { uri: string }): Promise<string> => {
        try {
            const uri = vscode.Uri.parse(params.uri);
            await vscode.workspace.fs.createDirectory(uri);
            return `VSCode FS 目录已成功创建: ${params.uri}`;
        } catch (error) {
            throw new Error(`VSCode FS 创建目录失败: ${error}`);
        }
    },

    fsReadDirectory: async (params: { uri: string }): Promise<Array<{ name: string; type: 'file' | 'directory' }>> => {
        try {
            const uri = vscode.Uri.parse(params.uri);
            const entries = await vscode.workspace.fs.readDirectory(uri);
            return entries.map(([name, type]) => ({
                name,
                type: type === vscode.FileType.File ? 'file' : 'directory'
            }));
        } catch (error) {
            throw new Error(`VSCode FS 读取目录失败: ${error}`);
        }
    },

    fsStat: async (params: { uri: string }): Promise<{
        type: 'file' | 'directory' | 'symbolicLink' | 'unknown';
        ctime: number;
        mtime: number;
        size: number;
    }> => {
        try {
            const uri = vscode.Uri.parse(params.uri);
            const stat = await vscode.workspace.fs.stat(uri);
            return {
                type: stat.type === vscode.FileType.File ? 'file' :
                       stat.type === vscode.FileType.Directory ? 'directory' :
                       stat.type === vscode.FileType.SymbolicLink ? 'symbolicLink' : 'unknown',
                ctime: stat.ctime,
                mtime: stat.mtime,
                size: stat.size
            };
        } catch (error) {
            throw new Error(`VSCode FS 获取文件状态失败: ${error}`);
        }
    },

    fsCopy: async (params: { source: string; destination: string }): Promise<string> => {
        try {
            const sourceUri = vscode.Uri.parse(params.source);
            const destUri = vscode.Uri.parse(params.destination);
            await vscode.workspace.fs.copy(sourceUri, destUri);
            return `VSCode FS 文件/目录已成功复制: ${params.source} -> ${params.destination}`;
        } catch (error) {
            throw new Error(`VSCode FS 复制失败: ${error}`);
        }
    }
};

// 工具定义
export const tools = [
  {
      "type": "function",
      "function":{
          name: "getProjectPath",
          description: "返回当前打开的工作区的URI",
          parameters: {
            type: "object",
            properties: {},
            required:[]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "getCurrentFilePath",
          description: "获取当前活动编辑器中打开文件的URI",
          parameters: {
            type: "object",
            properties: {},
            required:[]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "getAllOpenFiles",
          description: "获取当前所有打开文件的 URI列表",
          parameters: {
            type: "object",
            properties: {},
            required:[]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "getCurrentSelection",
          description: "获取当前选中的文本内容及其位置信息",
          parameters: {
            type: "object",
            properties: {},
            required:[]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "getCurrentLineContent",
          description: "获取当前光标所在行的完整内容",
          parameters: {
            type: "object",
            properties: {},
            required:[]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "getCursorInfo",
          description: "获取当前光标的位置信息(行号、列号、总行数)",
          parameters: {
            type: "object",
            properties: {},
            required:[]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "openFileToEdit",
          description: "在编辑器中打开指定文件的 URI",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "要打开文件的 URI"
              }
            },
            required:["filePath"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsReadFile",
          description: "使用 vscode.workspace.fs API 读取文件内容",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "文件的 URI，可以是 file:// 或其他支持的协议"
              }
            },
            required:["uri"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsWriteFile",
          description: "使用 vscode.workspace.fs API 写入文件内容",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "文件的 URI，可以是 file:// 或其他支持的协议"
              },
              content:{
                type: "string",
                description: "要写入的文件内容"
              }
            },
            required:["uri","content"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsDelete",
          description: "使用 vscode.workspace.fs API 删除文件或目录",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "要删除的文件或目录的 URI"
              },
              recursive:{
                type: "boolean",
                description: "是否递归删除目录（可选，默认为 false）"
              }
            },
            required:["uri"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsRename",
          description: "使用 vscode.workspace.fs API 重命名文件或目录",
          parameters: {
            type: "object",
            properties: {
              oldUri:{
                type: "string",
                description: "原文件或目录的 URI"
              },
              newUri:{
                type: "string",
                description: "新文件或目录的 URI"
              }
            },
            required:["oldUri","newUri"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsCreateDirectory",
          description: "使用 vscode.workspace.fs API 创建目录",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "要创建的目录的 URI"
              }
            },
            required:["uri"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsReadDirectory",
          description: "使用 vscode.workspace.fs API 读取目录内容",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "目录的 URI"
              }
            },
            required:["uri"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsStat",
          description: "使用 vscode.workspace.fs API 获取文件或目录的状态信息",
          parameters: {
            type: "object",
            properties: {
              uri:{
                type: "string",
                description: "文件或目录的 URI"
              }
            },
            required:["uri"]
          }
      }
  },
  {
      "type": "function",
      "function":{
          name: "fsCopy",
          description: "使用 vscode.workspace.fs API 复制文件或目录",
          parameters: {
            type: "object",
            properties: {
              source:{
                type: "string",
                description: "源文件或目录的 URI"
              },
              destination:{
                type: "string",
                description: "目标文件或目录的 URI"
              }
            },
            required:["source","destination"]
          }
      }
  }
]