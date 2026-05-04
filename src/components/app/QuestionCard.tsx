import React, { useState } from 'react';

export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: Array<{
    question: string;
    header?: string;
    multiple?: boolean;
    options: Array<{ label: string; description?: string }>;
  }>;
};

type QuestionCardProps = {
  question: QuestionRequest;
  onReply: (requestID: string, answers: string[][]) => Promise<void>;
  onReject: (requestID: string) => Promise<void>;
};

export function QuestionCard({ question, onReply, onReject }: QuestionCardProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({});
  const [customText, setCustomText] = useState<Record<number, string>>({});
  const [isResponding, setIsResponding] = useState(false);

  const questions = question.questions ?? [];
  const activeQuestion = questions[activeTab];

  const toggleOption = (qIdx: number, label: string) => {
    const isMultiple = questions[qIdx]?.multiple ?? false;
    setCustomMode(prev => ({ ...prev, [qIdx]: false }));
    setSelectedOptions(prev => {
      const current = prev[qIdx] ?? [];
      if (isMultiple) {
        const exists = current.includes(label);
        const next = exists ? current.filter(item => item !== label) : [...current, label];
            return { ...prev, [qIdx]: next };
      }
        return { ...prev, [qIdx]: [label] };
    });
  };

  const handleSelectCustom = (qIdx: number) => {
    setCustomMode(prev => ({ ...prev, [qIdx]: true }));
    setSelectedOptions(prev => ({ ...prev, [qIdx]: [] }));
  };

  const buildAnswers = (): string[][] => {
    const answers: string[][] = [];
    for (let i = 0; i < questions.length; i++) {
      const isCustom = customMode[i] ?? false;
      if (isCustom) {
        const value = (customText[i] ?? '').trim();
        answers.push(value ? [value] : []);
      } else {
        answers.push(selectedOptions[i] ?? []);
      }
    }
    return answers;
  };

  const unansweredIndexes = questions
    .map((_, idx) => {
      const isCustom = customMode[idx] ?? false;
      if (isCustom) return (customText[idx] ?? '').trim() ? -1 : idx;
      return (selectedOptions[idx] ?? []).length > 0 ? -1 : idx;
    })
    .filter(idx => idx >= 0);

  const canSubmit = unansweredIndexes.length === 0 && questions.length > 0;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setIsResponding(true);
    try {
      const answers = buildAnswers();
        await onReply(question.id, answers);
      } catch (e) {
      } finally {
      setIsResponding(false);
    }
  };

  const handleDismiss = async () => {
    setIsResponding(true);
    try {
      await onReject(question.id);
      } catch (e) {
      } finally {
      setIsResponding(false);
    }
  };

  const handleNext = () => {
    if (unansweredIndexes.length > 0) {
      const nextIdx = unansweredIndexes.find(idx => idx > activeTab) ?? unansweredIndexes[0];
      setActiveTab(nextIdx);
    }
  };

  if (!activeQuestion) return null;

  const isMultiple = activeQuestion.multiple ?? false;
  const selectedForActive = selectedOptions[activeTab] ?? [];
  const isCustomActive = customMode[activeTab] ?? false;

  return (
    <div style={{ border: '1px solid #edb449', borderRadius: 8, padding: 12, marginBottom: 8, background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#edb449' }}> Input needed</span>
        {questions.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {questions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 4,
                  background: activeTab === idx ? '#edb449' : 'var(--bg-3)',
                  color: activeTab === idx ? '#000' : 'var(--text-2)',
                  cursor: 'pointer'
                }}
              >
                {q.header || `Q${idx + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{activeQuestion.question}</div>
        {isMultiple && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Select multiple</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {activeQuestion.options.map((option, idx) => {
          const selected = selectedForActive.includes(option.label);
          return (
            <button
              key={idx}
              onClick={() => toggleOption(activeTab, option.label)}
              disabled={isResponding}
              style={{
                padding: 8,
                textAlign: 'left',
                border: '1px solid var(--bg-4)',
                borderRadius: 4,
                background: selected ? 'rgba(237, 180, 73, 0.1)' : 'var(--bg-3)',
                cursor: isResponding ? 'not-allowed' : 'pointer',
                opacity: isResponding ? 0.6 : 1
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selected}
                  readOnly
                  style={{ marginTop: 2 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: selected ? 500 : 400 }}>{option.label}</div>
                  {option.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{option.description}</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        <button
          onClick={() => handleSelectCustom(activeTab)}
          disabled={isResponding}
          style={{
            padding: 8,
            textAlign: 'left',
            border: '1px solid var(--bg-4)',
            borderRadius: 4,
            background: isCustomActive ? 'rgba(237, 180, 73, 0.1)' : 'var(--bg-3)',
            cursor: isResponding ? 'not-allowed' : 'pointer',
            opacity: isResponding ? 0.6 : 1
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>Other</span>
          </div>
        </button>

        {isCustomActive && (
          <textarea
            value={customText[activeTab] ?? ''}
            onChange={(e) => setCustomText(prev => ({ ...prev, [activeTab]: e.target.value }))}
            placeholder="Your answer"
            disabled={isResponding}
            rows={2}
            style={{
              width: '100%',
              padding: 8,
              fontSize: 13,
              border: '1px solid var(--bg-4)',
              borderRadius: 4,
              background: 'var(--bg-1)',
              color: 'var(--text-1)',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
            autoFocus
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={canSubmit ? handleConfirm : handleNext}
          disabled={isResponding}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            borderRadius: 4,
            background: '#4a9d5f',
            color: '#fff',
            cursor: isResponding ? 'not-allowed' : 'pointer',
            opacity: isResponding ? 0.6 : 1
          }}
        >
          {canSubmit ? 'Submit' : 'Next'}
        </button>

        <button
          onClick={handleDismiss}
          disabled={isResponding}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            borderRadius: 4,
            background: '#d9534f',
            color: '#fff',
            cursor: isResponding ? 'not-allowed' : 'pointer',
            opacity: isResponding ? 0.6 : 1
          }}
        >
          ✕ Dismiss
        </button>

        {isResponding && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
            Sending...
          </div>
        )}
      </div>
    </div>
  );
}
