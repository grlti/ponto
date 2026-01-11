document.addEventListener('DOMContentLoaded', () => {
    const clockElement = document.getElementById('clock');
    const dateElement = document.getElementById('date');
    const btnRegister = document.getElementById('btn-register');
    const btnPdf = document.getElementById('btn-pdf');
    const btnClear = document.getElementById('btn-clear');
    const historyList = document.getElementById('history-list');

    // Stats Elements
    const elResWorked = document.getElementById('stat-worked');
    const elResOvertime = document.getElementById('stat-overtime');
    const elResMonth = document.getElementById('stat-month');

    // State
    let records = [];
    let history = []; // List of { date: 'YYYY-MM-DD', balance: minutes }

    // Initialize
    loadRecords();
    updateClock();
    setInterval(updateClock, 1000);

    // --- Core Functions ---

    function updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR');
        const dateString = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

        clockElement.textContent = timeString;
        dateElement.textContent = capitalizeFirstLetter(dateString);
    }

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    function loadRecords() {
        const stored = localStorage.getItem('pontos_hoje');
        const todayDate = new Date().toLocaleDateString('pt-BR');
        const storedDate = localStorage.getItem('pontos_data');
        const storedHistory = localStorage.getItem('pontos_history');

        if (storedHistory) {
            history = JSON.parse(storedHistory);
        }

        if (stored && storedDate === todayDate) {
            records = JSON.parse(stored);
        } else {
            // New day detected. Archive previous day if it exists and hasn't been archived.
            if (stored && storedDate) {
                archiveDay(storedDate, JSON.parse(stored));
            }
            records = [];
            localStorage.removeItem('pontos_hoje');
            localStorage.setItem('pontos_data', todayDate);
        }
        renderHistory();
        updateStats();
    }

    function archiveDay(dateStr, dayRecords) {
        // Calculate balance for that day
        const { balance } = calculateDailyStats(dayRecords);
        // Avoid duplicate entry for same date
        if (!history.find(h => h.date === dateStr)) {
            history.push({ date: dateStr, balance: balance });
            localStorage.setItem('pontos_history', JSON.stringify(history));
        }
    }

    function saveRecords() {
        const todayDate = new Date().toLocaleDateString('pt-BR');
        localStorage.setItem('pontos_hoje', JSON.stringify(records));
        localStorage.setItem('pontos_data', todayDate);
        updateStats();
    }

    function addRecord() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // Determine type based on previous records
        // Simple logic: Entry -> Lunch Out -> Lunch In -> Exit -> (Repeat/Extra)
        // If we want to be explicit, we could ask. For this v1, we'll infer just by count 
        // 0 -> Entrada
        // 1 -> Saída para Almoço
        // 2 -> Volta do Almoço
        // 3 -> Saída

        let type = 'Entrada';
        const count = records.length;

        if (count === 0) type = 'Entrada';
        else if (count === 1) type = 'Intervalo - Saída';
        else if (count === 2) type = 'Intervalo - Volta';
        else if (count === 3) type = 'Saída';
        else type = 'Registro Extra';

        const record = {
            id: Date.now(),
            time: timeString,
            type: type,
            timestamp: now.getTime()
        };

        records.unshift(record); // Add to top
        saveRecords();
        renderHistory();

        // Visual feedback
        btnRegister.classList.add('pulse');
        setTimeout(() => btnRegister.classList.remove('pulse'), 300);
    }

    function clearRecords() {
        if (confirm('Tem certeza que deseja limpar os registros de hoje?')) {
            records = [];
            saveRecords();
            renderHistory();
            updateStats();
        }
    }

    // --- Stats Logic ---

    function minutesToHm(minutes) {
        const sign = minutes < 0 ? "-" : "";
        const m = Math.abs(minutes);
        const h = Math.floor(m / 60);
        const mins = m % 60;
        return `${sign}${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    function calculateDailyStats(recs) {
        // recs is ordered new -> old. Let's reverse to be chronological for calculation
        const chronological = [...recs].reverse();
        let minutesWorked = 0;
        let entryTime = null;

        chronological.forEach(r => {
            // Simplified logic: Odd items are Entry, Even items are Exit (roughly)
            // Or better: check types?
            // "Entrada" or "Intervalo - Volta" -> Start counting
            // "Saída" or "Intervalo - Saída" -> Stop counting

            const isEntry = r.type.includes('Entrada') || r.type.includes('Volta');
            const isExit = r.type.includes('Saída');

            if (isEntry) {
                if (entryTime === null) entryTime = r.timestamp;
            } else if (isExit) {
                if (entryTime !== null) {
                    const diffMs = r.timestamp - entryTime;
                    minutesWorked += Math.floor(diffMs / 1000 / 60);
                    entryTime = null;
                }
            }
        });

        // Note: If currently working (entryTime != null), we don't count it yet?
        // Or we could count to 'now'? User requested "calculated in the day".
        // Usually, unfinished periods don't count until closed, or show as running.
        // Let's stick to CLOSED periods to avoid ticking UI complexity for now.

        const DAILY_GOAL_MINUTES = 8 * 60;
        const balance = minutesWorked - DAILY_GOAL_MINUTES;

        return { minutesWorked, balance };
    }

    function updateStats() {
        const { minutesWorked, balance } = calculateDailyStats(records);

        // Monthly Balance
        // Filter history for current month/year
        const now = new Date();
        const curMonth = now.getMonth();
        const curYear = now.getFullYear();

        let monthlyBalance = balance; // Start with today's balance

        history.forEach(day => {
            // day.date format "DD/MM/YYYY" (pt-BR) or "YYYY-MM-DD"?
            // We stored using toLocaleDateString('pt-BR') which is DD/MM/YYYY
            const parts = day.date.split('/');
            if (parts.length === 3) {
                const dayMonth = parseInt(parts[1]) - 1; // 0-indexed
                const dayYear = parseInt(parts[2]);

                if (dayMonth === curMonth && dayYear === curYear) {
                    monthlyBalance += day.balance;
                }
            }
        });

        // Update DOM
        elResWorked.textContent = minutesToHm(minutesWorked);

        elResOvertime.textContent = minutesToHm(balance);
        elResOvertime.className = 'stat-value ' + (balance >= 0 ? 'positive' : 'negative');

        elResMonth.textContent = minutesToHm(monthlyBalance);
        elResMonth.className = 'stat-value ' + (monthlyBalance >= 0 ? 'positive' : 'negative');
    }

    function renderHistory() {
        historyList.innerHTML = '';

        if (records.length === 0) {
            historyList.innerHTML = '<li class="empty-state">Nenhum registro hoje.</li>';
            return;
        }

        records.forEach(rec => {
            const li = document.createElement('li');
            li.className = 'history-item';

            li.innerHTML = `
                <span class="type-badge">${rec.type}</span>
                <span class="time-bg">${rec.time}</span>
            `;

            historyList.appendChild(li);
        });
    }

    async function generatePDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(40, 40, 40);
        doc.text("Relatório de Ponto", 105, 20, null, null, "center");

        // Date
        const today = new Date().toLocaleDateString('pt-BR');
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.text(`Data: ${today}`, 105, 30, null, null, "center");

        // Line divider
        doc.setLineWidth(0.5);
        doc.line(20, 35, 190, 35);

        // Content
        let y = 50;
        doc.setFontSize(12);

        if (records.length === 0) {
            doc.text("Nenhum registro encontrado para hoje.", 20, y);
        } else {
            // Table Header
            doc.setFont("helvetica", "bold");
            doc.text("Tipo", 30, y);
            doc.text("Horário", 150, y);
            y += 10;

            // Items (reverse order to show chronological if currently sorted desc)
            // records is unshifted, so records[0] is latest. Let's reverse for PDF to be chronological.
            const chronologicalRecords = [...records].reverse();

            doc.setFont("helvetica", "normal");
            chronologicalRecords.forEach(rec => {
                doc.text(rec.type, 30, y);
                doc.text(rec.time, 150, y);
                y += 10;
            });
        }

        // Footer
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("Gerado automaticamente pelo Sistema de Controle de Ponto", 105, 280, null, null, "center");

        doc.save(`relatorio_ponto_${today.replace(/\//g, '-')}.pdf`);
    }

    // --- Event Listeners ---
    btnRegister.addEventListener('click', addRecord);
    btnPdf.addEventListener('click', generatePDF);
    btnClear.addEventListener('click', clearRecords);
});
