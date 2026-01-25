// 問題データを読み込む
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = {}; // { questionId: selectedOptionIndex }
let shuffledOptions = {}; // { questionId: { shuffledOptions: [...], correctAnswerIndex: number, originalToShuffled: Map } }
let skippedQuestions = new Set(); // スキップした問題IDのセット

// 問題データを読み込む
function loadQuestions() {
    try {
        // questions.jsから直接読み込む
        const loadedQuestions = questionsData || [];
        
        // 問題IDでマップを作成
        const questionMap = new Map();
        loadedQuestions.forEach(q => {
            questionMap.set(q.id, q);
        });
        
        // 1から191までのすべての問題を生成（不足分はプレースホルダー）
        questions = [];
        for (let i = 1; i <= 191; i++) {
            if (questionMap.has(i)) {
                questions.push(questionMap.get(i));
            } else {
                questions.push({
                    id: i,
                    question: `問題 ${i} の内容（後ほど追加予定）`,
                    options: [
                        "選択肢1",
                        "選択肢2",
                        "選択肢3",
                        "選択肢4"
                    ],
                    correctAnswer: null
                });
            }
        }
        
        initializeApp();
    } catch (error) {
        console.error('問題データの読み込みに失敗しました:', error);
        alert('問題データの読み込みに失敗しました。\nエラー: ' + error.message);
    }
}

// アプリを初期化
function initializeApp() {
    updateTotalQuestions();
    displayQuestion(currentQuestionIndex);
    updateProgress();
    generateQuestionGrid();
    setupEventListeners();
}

// 総問題数を更新
function updateTotalQuestions() {
    document.getElementById('totalQuestions').textContent = questions.length;
}

// 選択肢をシャッフル（Fisher-Yatesアルゴリズム）
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 問題の選択肢をシャッフルして保存
function getShuffledOptions(question) {
    if (!shuffledOptions[question.id]) {
        // 選択肢をシャッフル
        const shuffled = shuffleArray(question.options);
        
        // 元のインデックスからシャッフル後のインデックスへのマッピング
        const originalToShuffled = new Map();
        const shuffledToOriginal = new Map();
        
        shuffled.forEach((option, newIndex) => {
            const originalIndex = question.options.indexOf(option);
            originalToShuffled.set(originalIndex, newIndex);
            shuffledToOriginal.set(newIndex, originalIndex);
        });
        
        // 正解のインデックスを更新
        let newCorrectAnswer = null;
        if (question.correctAnswer !== null) {
            newCorrectAnswer = originalToShuffled.get(question.correctAnswer);
        }
        
        shuffledOptions[question.id] = {
            shuffledOptions: shuffled,
            correctAnswerIndex: newCorrectAnswer,
            originalToShuffled: originalToShuffled,
            shuffledToOriginal: shuffledToOriginal
        };
    }
    
    return shuffledOptions[question.id];
}

// 問題を表示
function displayQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    
    currentQuestionIndex = index;
    const question = questions[index];
    
    // まず正解セクションを確実に非表示にして内容をクリア
    const answerSection = document.getElementById('answerSection');
    answerSection.style.display = 'none';
    document.getElementById('correctAnswer').textContent = '';
    document.getElementById('explanationText').textContent = '';
    
    // 結果表示ボタンの表示/非表示を更新
    const showResultButton = document.getElementById('showResultButton');
    if (index === questions.length - 1 && userAnswers[question.id] !== undefined) {
        // 最後の問題で回答済みの場合のみ表示
        showResultButton.style.display = 'block';
    } else {
        showResultButton.style.display = 'none';
    }
    
    // 問題番号と問題文を更新
    document.getElementById('questionNumber').textContent = question.id;
    document.getElementById('currentQuestion').textContent = question.id;
    document.getElementById('questionText').textContent = question.question;
    
    // 選択肢をシャッフルして取得
    const shuffled = getShuffledOptions(question);
    
    // 選択肢を生成（既存の選択肢を完全に削除してから再生成）
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';
    
    shuffled.shuffledOptions.forEach((option, optionIndex) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option';
        
        // 回答済みの場合のみ選択状態を表示（正解/不正解は表示しない）
        if (userAnswers[question.id] === optionIndex) {
            optionElement.classList.add('selected');
        }
        
        optionElement.innerHTML = `
            <span class="option-number">${optionIndex + 1}</span>
            <span class="option-text">${option}</span>
        `;
        
        optionElement.addEventListener('click', () => selectOption(question.id, optionIndex));
        optionsContainer.appendChild(optionElement);
    });
    
    // ナビゲーションボタンの状態を更新
    document.getElementById('prevButton').disabled = index === 0;
    document.getElementById('nextButton').disabled = index === questions.length - 1;
    
    // 問題一覧の現在の問題をハイライト
    updateQuestionGrid();
    updateProgress();
}

// 選択肢を選択
function selectOption(questionId, optionIndex) {
    userAnswers[questionId] = optionIndex;
    
    // 選択状態を更新
    const options = document.querySelectorAll('.option');
    const question = questions.find(q => q.id === questionId);
    const shuffled = shuffledOptions[questionId];
    
    options.forEach((opt, idx) => {
        opt.classList.remove('selected', 'correct', 'incorrect');
        if (idx === optionIndex) {
            opt.classList.add('selected');
            // 回答後、正解/不正解を表示
            if (shuffled && shuffled.correctAnswerIndex !== null) {
                if (idx === shuffled.correctAnswerIndex) {
                    opt.classList.add('correct');
                } else {
                    opt.classList.add('incorrect');
                }
            }
        }
    });
    
    // 正解をハイライト（回答後は常に表示）
    highlightCorrectAnswer();
    
    // 正解表示セクションを表示
    updateAnswerDisplay();
    
    // 問題一覧を更新
    updateQuestionGrid();
    
    // 最後の問題を回答した場合、結果表示ボタンを表示
    if (currentQuestionIndex === questions.length - 1) {
        const showResultButton = document.getElementById('showResultButton');
        showResultButton.style.display = 'block';
    }
}

// 前の問題へ
function goToPreviousQuestion() {
    if (currentQuestionIndex > 0) {
        displayQuestion(currentQuestionIndex - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 次の問題へ
function goToNextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        displayQuestion(currentQuestionIndex + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 現在の問題をスキップ
function skipCurrentQuestion() {
    const question = questions[currentQuestionIndex];
    skippedQuestions.add(question.id);
    
    // スキップした問題の回答を削除（スキップした問題は未回答として扱う）
    if (userAnswers[question.id] !== undefined) {
        delete userAnswers[question.id];
    }
    
    // 次の問題へ移動
    if (currentQuestionIndex < questions.length - 1) {
        goToNextQuestion();
    } else {
        // 最後の問題の場合、最初の未回答の問題へ移動
        const nextUnansweredIndex = questions.findIndex((q, idx) => 
            idx > currentQuestionIndex && 
            userAnswers[q.id] === undefined && 
            !skippedQuestions.has(q.id)
        );
        
        if (nextUnansweredIndex !== -1) {
            displayQuestion(nextUnansweredIndex);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // 未回答の問題がない場合、最初のスキップした問題へ
            const firstSkippedIndex = questions.findIndex(q => skippedQuestions.has(q.id));
            if (firstSkippedIndex !== -1) {
                displayQuestion(firstSkippedIndex);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }
    
    // 問題一覧を更新
    updateQuestionGrid();
}

// 特定の問題へジャンプ
function jumpToQuestion(questionId) {
    const questionIndex = questions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
        displayQuestion(questionIndex);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 進捗バーを更新
function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
}

// 問題一覧グリッドを生成
function generateQuestionGrid() {
    const grid = document.getElementById('questionGrid');
    grid.innerHTML = '';
    
    questions.forEach(question => {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.textContent = question.id;
        item.addEventListener('click', () => jumpToQuestion(question.id));
        grid.appendChild(item);
    });
    
    updateQuestionGrid();
}

// 問題一覧グリッドを更新
function updateQuestionGrid() {
    const items = document.querySelectorAll('.question-item');
    items.forEach((item, index) => {
        item.classList.remove('current', 'answered', 'correct-answered', 'incorrect-answered', 'skipped');
        
        if (index === currentQuestionIndex) {
            item.classList.add('current');
        }
        
        const questionId = questions[index].id;
        const question = questions[index];
        const userAnswer = userAnswers[questionId];
        const isSkipped = skippedQuestions.has(questionId);
        
        if (isSkipped) {
            item.classList.add('skipped');
        }
        
        if (userAnswer !== undefined) {
            item.classList.add('answered');
            
            // 回答済みの問題は正解/不正解を表示
            const shuffled = shuffledOptions[questionId];
            if (shuffled && shuffled.correctAnswerIndex !== null) {
                if (userAnswer === shuffled.correctAnswerIndex) {
                    item.classList.add('correct-answered');
                } else {
                    item.classList.add('incorrect-answered');
                }
            }
        }
    });
}

// 正解表示を更新（回答済みの問題のみ表示）
function updateAnswerDisplay() {
    const answerSection = document.getElementById('answerSection');
    const correctAnswerDiv = document.getElementById('correctAnswer');
    const explanationText = document.getElementById('explanationText');
    
    const question = questions[currentQuestionIndex];
    const shuffled = shuffledOptions[question.id];
    
    // 回答済みの問題の場合のみ正解を表示
    if (userAnswers[question.id] !== undefined && shuffled && shuffled.correctAnswerIndex !== null) {
        answerSection.style.display = 'block';
        const correctOption = shuffled.shuffledOptions[shuffled.correctAnswerIndex];
        correctAnswerDiv.textContent = `正解: ${shuffled.correctAnswerIndex + 1}. ${correctOption}`;
        
        if (question.explanation) {
            explanationText.textContent = question.explanation;
            document.getElementById('explanationContainer').style.display = 'block';
        } else {
            document.getElementById('explanationContainer').style.display = 'none';
        }
    } else {
        answerSection.style.display = 'none';
    }
}

// 正解をハイライト（回答済みの問題のみ）
function highlightCorrectAnswer() {
    const question = questions[currentQuestionIndex];
    const shuffled = shuffledOptions[question.id];
    
    // 回答済みの問題の場合のみハイライト
    if (!question || !shuffled || shuffled.correctAnswerIndex === null || userAnswers[question.id] === undefined) {
        return;
    }
    
    const options = document.querySelectorAll('.option');
    options.forEach((opt, idx) => {
        // 既に選択時に設定されたcorrect/incorrectクラスは保持
        if (idx === shuffled.correctAnswerIndex && !opt.classList.contains('correct')) {
            opt.classList.add('correct');
        }
    });
}

// 正解率を計算
function calculateAccuracy() {
    let correctCount = 0;
    let answeredCount = 0;
    
    questions.forEach(question => {
        const userAnswer = userAnswers[question.id];
        if (userAnswer !== undefined) {
            answeredCount++;
            const shuffled = shuffledOptions[question.id];
            if (shuffled && shuffled.correctAnswerIndex !== null) {
                if (userAnswer === shuffled.correctAnswerIndex) {
                    correctCount++;
                }
            }
        }
    });
    
    // 正解率 = 正解数 / 総問題数
    const accuracy = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
    
    return {
        correctCount,
        answeredCount,
        totalCount: questions.length,
        accuracy: Math.round(accuracy * 10) / 10 // 小数点第1位まで
    };
}

// 結果モーダルを表示
function showResultModal() {
    const result = calculateAccuracy();
    const modal = document.getElementById('resultModal');
    
    document.getElementById('correctCount').textContent = `${result.correctCount}問`;
    document.getElementById('answeredCount').textContent = `${result.answeredCount}問 / ${result.totalCount}問`;
    document.getElementById('accuracyRate').textContent = `${result.accuracy}%`;
    
    // メッセージを設定
    const messageDiv = document.getElementById('resultMessage');
    let message = '';
    if (result.answeredCount === 0) {
        message = 'まだ回答がありません。問題に答えてください。';
    } else if (result.accuracy >= 80) {
        message = '素晴らしい成績です！合格ラインに達しています。';
    } else if (result.accuracy >= 60) {
        message = '良い成績です。もう少し頑張りましょう！';
    } else {
        message = 'もう一度復習して、理解を深めましょう。';
    }
    messageDiv.textContent = message;
    
    modal.style.display = 'flex';
}

// 結果モーダルを閉じる
function closeResultModal() {
    const modal = document.getElementById('resultModal');
    modal.style.display = 'none';
}

// 再試験を開始（すべての状態をリセット）
function restartExam() {
    // すべての回答をクリア
    userAnswers = {};
    
    // スキップした問題をクリア
    skippedQuestions.clear();
    
    // シャッフルされた選択肢をクリア（次回表示時に再シャッフルされる）
    shuffledOptions = {};
    
    // 現在の問題インデックスを最初に戻す
    currentQuestionIndex = 0;
    
    // 結果表示ボタンを非表示
    document.getElementById('showResultButton').style.display = 'none';
    
    // 結果モーダルを閉じる
    closeResultModal();
    
    // 最初の問題を表示
    displayQuestion(0);
    
    // 問題一覧を更新
    updateQuestionGrid();
    
    // ページの先頭にスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// イベントリスナーを設定
function setupEventListeners() {
    document.getElementById('prevButton').addEventListener('click', goToPreviousQuestion);
    document.getElementById('nextButton').addEventListener('click', goToNextQuestion);
    document.getElementById('skipButton').addEventListener('click', skipCurrentQuestion);
    document.getElementById('showResultButton').addEventListener('click', showResultModal);
    document.getElementById('restartButton').addEventListener('click', restartExam);
    document.getElementById('closeModalButton').addEventListener('click', closeResultModal);
    
    // モーダルの背景をクリックしても閉じる
    document.getElementById('resultModal').addEventListener('click', (e) => {
        if (e.target.id === 'resultModal') {
            closeResultModal();
        }
    });
    
    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' && currentQuestionIndex > 0) {
            goToPreviousQuestion();
        } else if (e.key === 'ArrowRight' && currentQuestionIndex < questions.length - 1) {
            goToNextQuestion();
        } else if (e.key >= '1' && e.key <= '4') {
            const optionIndex = parseInt(e.key) - 1;
            selectOption(questions[currentQuestionIndex].id, optionIndex);
        } else if (e.key === 'Escape') {
            closeResultModal();
        } else if (e.key === 's' || e.key === 'S') {
            skipCurrentQuestion();
        }
    });
}

// アプリを起動
loadQuestions();
