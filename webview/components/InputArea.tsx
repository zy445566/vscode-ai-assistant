import React, { useState } from 'react';
import styles from './InputArea.module.css';

interface InputAreaProps {
    onSendMessage: (message: string) => void;
    onCancelMessage: () => void;
    isLoading?: boolean;
}
let lastMessage = '';
export const InputArea: React.FC<InputAreaProps> = ({ 
    onSendMessage, 
    onCancelMessage,
    isLoading = false 
}) => {
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = () => {
        const message = inputValue.trim();
        if (message && !isLoading) {
            lastMessage = message;
            onSendMessage(message);
            setInputValue('');
        }
    };
    const handleCancel = () => {
        if (isLoading) {
            onCancelMessage();
            // setInputValue(lastMessage);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className={styles.inputContainer}>
            <input
                type="text"
                id="messageInput"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                disabled={isLoading}
                className={styles.messageInput}
            />
            {!isLoading && <button 
                className={styles.button} 
                onClick={handleSubmit}
            >
                发送
            </button>
            }
            {isLoading && <button 
                className={styles.button} 
                onClick={handleCancel}
            >
                ⏸
            </button>
            }
        </div>
    );
};