document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const grid = document.getElementById('calculator-grid');
    const addColumnBtn = document.getElementById('add-column');
    const clearAllBtn = document.getElementById('clear-all');
    const modalOverlay = document.getElementById('modal-overlay');
    const confirmClearBtn = document.getElementById('confirm-clear');
    const cancelClearBtn = document.getElementById('cancel-clear');

    const addDiffColumnBtn = document.getElementById('add-diff-column');

    let _sortable = null;

    let state = {
        columns: [],
        isLightMode: false
    };

    function createDefaultRows(count = 30) {
        return Array(count).fill('').map(() => ({ v: '', c: null }));
    }

    // Initialize from LocalStorage
    const savedState = localStorage.getItem('multi_calc_state');
    if (savedState) {
        state = JSON.parse(savedState);
        // Migration: convert strings to objects if needed
        state.columns.forEach(col => {
            col.rows = col.rows.map(row => {
                if (typeof row === 'string') return { v: row, c: null };
                return row;
            });
        });
        if (state.isLightMode === undefined) state.isLightMode = false;
        render();
        applyTheme();
    } else {
        // Default: Add 3 columns with 30 rows each
        state.columns = [
            { id: Date.now(), name: 'i幣', rows: createDefaultRows(), type: 'standard' },
            { id: Date.now() + 1, name: '鑽石', rows: createDefaultRows(), type: 'standard' },
            { id: Date.now() + 2, name: '道具卡專用', rows: createDefaultRows(), type: 'diff' }
        ];
        render();
    }

    function saveState() {
        localStorage.setItem('multi_calc_state', JSON.stringify(state));
    }

    function formatNumber(num) {
        if (!num && num !== 0) return '0';
        
        let parsed = parseFloat(num);
        if (isNaN(parsed)) return '0';
        
        // Fix floating point math errors (e.g., 0.1 + 0.2 = 0.30000000000000004)
        // by rounding to at most 10 decimal places, then stripping trailing zeros
        parsed = parseFloat(parsed.toFixed(10));
        
        const isNegative = parsed < 0;
        let str = Math.abs(parsed).toString();
        
        // Handle scientific notation for extremely small/large numbers
        if (str.includes('e')) {
            return isNegative ? '-' + str : str;
        }

        let parts = str.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        let formatted = parts.join('.');
        
        return isNegative ? '-' + formatted : formatted;
    }

    function calculateTotal(rows, type = 'standard') {
        if (type === 'diff') {
            let totalDiff = 0;
            for(let i = 1; i < rows.length; i++) {
                const curValStr = rows[i].v || '0';
                const prevValStr = rows[i-1].v || '0';
                const cur = parseFloat(curValStr.toString().replace(/,/g, '')) || 0;
                const prev = parseFloat(prevValStr.toString().replace(/,/g, '')) || 0;
                if (rows[i].v !== '') totalDiff += (cur - prev);
            }
            return totalDiff;
        }
        return rows.reduce((acc, curr) => {
            const valStr = curr.v || '0';
            const val = parseFloat(valStr.toString().replace(/,/g, '')) || 0;
            return acc + val;
        }, 0);
    }

    function createRowElement(colIndex, rowIndex, rowData, type = 'standard') {
        const row = document.createElement('div');
        row.className = `input-row ${type === 'diff' ? 'diff-row' : ''}`;
        
        const value = rowData.v || '';
        const color = rowData.c || null;
        
        if (color) {
            row.dataset.highlight = "true";
            row.style.setProperty('--highlight-bg', color);
            row.style.setProperty('--highlight-border', color.replace('0.2', '0.4'));
        }

        let diffHtml = '';
        if (type === 'diff') {
            const curVal = parseFloat(value.toString().replace(/,/g, '')) || 0;
            const prevVal = rowIndex > 0 ? (parseFloat((state.columns[colIndex].rows[rowIndex-1].v || '0').toString().replace(/,/g, '')) || 0) : null;
            
            let diffVal = 0;
            let diffClass = '';
            if (prevVal !== null) {
                diffVal = curVal - prevVal;
                if (diffVal > 0) diffClass = 'diff-positive';
                else if (diffVal < 0) diffClass = 'diff-negative';
            }
            
            const displayVal = prevVal === null ? '-' : (diffVal > 0 ? `+${formatNumber(diffVal)}` : formatNumber(diffVal));
            diffHtml = `<div class="diff-display ${diffClass}">${displayVal}</div>`;
        }

        const colors = [
            { name: 'none', value: null },
            { name: 'yellow', value: 'rgba(234, 179, 8, 0.2)' },
            { name: 'blue', value: 'rgba(56, 189, 248, 0.2)' },
            { name: 'green', value: 'rgba(34, 197, 94, 0.2)' },
            { name: 'red', value: 'rgba(239, 68, 68, 0.2)' },
            { name: 'purple', value: 'rgba(168, 85, 247, 0.2)' }
        ];

        row.innerHTML = `
            <input type="text" class="number-input" value="${value}" placeholder="0" inputmode="text">
            ${diffHtml}
            <button class="highlight-btn" title="標記顏色">
                <div class="color-dot" style="background: ${color || 'transparent'}"></div>
                <div class="color-picker-mini">
                    ${colors.map(c => `
                        <div class="color-option ${c.name === 'none' ? 'color-none' : ''}" 
                             data-color="${c.value || ''}" 
                             style="background: ${c.value || 'transparent'}">
                             ${c.name === 'none' ? '✕' : ''}
                        </div>
                    `).join('')}
                </div>
            </button>
            <button class="remove-row-btn" title="刪除此行">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        const input = row.querySelector('input');

        function evaluateCell() {
            let val = input.value;
            // Only evaluate if there's an operator and it's not just a single minus
            if (val && /[\+\-\*\/]/.test(val) && val !== '-') {
                try {
                    // Prevent octal evaluation by removing leading zeros from integers
                    let cleanVal = val.replace(/(^|[^.\d])0+(\d+)/g, '$1$2');
                    
                    let result = new Function('return (' + cleanVal + ')')();
                    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                        result = parseFloat(result.toFixed(10)); // Clean up float errors
                        val = result.toString();
                        input.value = val;
                        state.columns[colIndex].rows[rowIndex].v = val;
                        if (type === 'diff') renderColumnRows(colIndex);
                        updateColumnTotal(colIndex);
                        saveState();
                    }
                } catch (err) {
                    // Ignore syntax errors while typing
                }
            }
        }

        input.addEventListener('blur', evaluateCell);

        input.addEventListener('input', (e) => {
            // Allow numbers, decimals, and math operators
            let val = e.target.value.replace(/[^\d.\-+*\/()]/g, '');
            
            state.columns[colIndex].rows[rowIndex].v = val;
            e.target.value = val; // Keep cursor correct
            
            if (type === 'diff') {
                renderColumnRows(colIndex);
            }
            updateColumnTotal(colIndex);
            
            // Auto-add row if typing in the last one
            if (rowIndex === state.columns[colIndex].rows.length - 1 && val !== '') {
                addRow(colIndex, false);
            }
            saveState();
        });

        // Highlight Logic
        const highlightBtn = row.querySelector('.highlight-btn');
        const colorPicker = row.querySelector('.color-picker-mini');
        
        highlightBtn.addEventListener('click', (e) => {
            if (e.target.closest('.color-picker-mini')) return;
            colorPicker.classList.toggle('active');
            
            // Close other color pickers
            document.querySelectorAll('.color-picker-mini.active').forEach(p => {
                if (p !== colorPicker) p.classList.remove('active');
            });
        });

        row.querySelectorAll('.color-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const selectedColor = e.target.dataset.color || null;
                state.columns[colIndex].rows[rowIndex].c = selectedColor;
                
                if (selectedColor) {
                    row.dataset.highlight = "true";
                    row.style.setProperty('--highlight-bg', selectedColor);
                    row.style.setProperty('--highlight-border', selectedColor.replace('0.2', '0.4'));
                    row.querySelector('.color-dot').style.background = selectedColor;
                } else {
                    row.dataset.highlight = "false";
                    row.style.removeProperty('--highlight-bg');
                    row.style.removeProperty('--highlight-border');
                    row.querySelector('.color-dot').style.background = 'transparent';
                }
                
                colorPicker.classList.remove('active');
                saveState();
            });
        });

        // Keyboard Navigation (Enter/Tab to go to next row)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                evaluateCell(); // Evaluate the expression if any
                
                // Shift+Tab should still work for reverse navigation
                if (e.key === 'Tab' && e.shiftKey) return;

                e.preventDefault();
                
                const nextRow = row.nextElementSibling;
                if (nextRow && nextRow.classList.contains('input-row')) {
                    const nextInput = nextRow.querySelector('.number-input');
                    if (nextInput) nextInput.focus();
                } else {
                    // Last row, trigger adding a new one
                    addRow(colIndex);
                }
            }
        });

        row.querySelector('.remove-row-btn').addEventListener('click', () => {
            state.columns[colIndex].rows.splice(rowIndex, 1);
            render();
            saveState();
        });

        return row;
    }

    function updateColumnTotal(colIndex) {
        const col = state.columns[colIndex];
        const totalValueEl = document.querySelector(`.calc-column[data-id="${col.id}"] .total-value`);
        if (totalValueEl) {
            const total = calculateTotal(col.rows, col.type);
            totalValueEl.textContent = formatNumber(total);
        }
    }

    function addRow(colIndex, autoFocus = true) {
        state.columns[colIndex].rows.push({ v: '', c: null });
        renderColumnRows(colIndex);
        saveState();
        
        if (autoFocus) {
            // Focus the newly added row's input
            const colEl = document.querySelector(`.calc-column[data-id="${state.columns[colIndex].id}"]`);
            if (colEl) {
                const inputs = colEl.querySelectorAll('.number-input');
                if (inputs.length > 0) {
                    inputs[inputs.length - 1].focus();
                }
            }
        }
    }

    function addColumn() {
        state.columns.push({
            id: Date.now(),
            name: '新一般欄位',
            rows: createDefaultRows(),
            type: 'standard'
        });
        render();
        saveState();
    }

    function addDiffColumn() {
        state.columns.push({
            id: Date.now(),
            name: '道具卡專用',
            rows: createDefaultRows(),
            type: 'diff'
        });
        render();
        saveState();
    }

    function removeColumn(colId) {
        state.columns = state.columns.filter(c => c.id !== colId);
        render();
        saveState();
    }

    function render() {
        grid.innerHTML = '';
        state.columns.forEach((col, colIndex) => {
            const colEl = document.createElement('div');
            colEl.className = 'calc-column';
            colEl.dataset.id = col.id;
            
            const total = calculateTotal(col.rows);
            
            colEl.innerHTML = `
                <button class="remove-column-btn" title="刪除此欄位">✕</button>
                <button class="clear-column-btn" title="清空此欄位資料">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <div class="drag-handle-container">
                    <span class="drag-handle" title="拖曳排序">⠿</span>
                </div>
                <div class="column-header">
                    <input type="text" class="item-name-input" value="${col.name}" placeholder="輸入名稱">
                    <div class="total-display">
                        <span class="total-label">${col.type === 'diff' ? '淨差額 Net Diff' : '總計 Total'}</span>
                        <span class="total-value">${formatNumber(total)}</span>
                    </div>
                </div>
                <div class="rows-container"></div>
                <button class="btn add-row-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    新增行
                </button>
            `;

            // Event Listeners for Column
            const nameInput = colEl.querySelector('.item-name-input');
            nameInput.addEventListener('input', (e) => {
                state.columns[colIndex].name = e.target.value;
                saveState();
            });

            colEl.querySelector('.remove-column-btn').addEventListener('click', () => {
                removeColumn(col.id);
            });

            colEl.querySelector('.clear-column-btn').addEventListener('click', () => {
                state.columns[colIndex].rows = createDefaultRows(state.columns[colIndex].rows.length);
                render();
                saveState();
            });

            colEl.querySelector('.add-row-btn').addEventListener('click', () => {
                addRow(colIndex);
            });

            renderColumnRows(colIndex, colEl);
            grid.appendChild(colEl);
        });

        initDragSort();
    }

    function initDragSort() {
        if (_sortable) {
            _sortable.destroy();
        }

        if (!window.Sortable) return;

        _sortable = window.Sortable.create(grid, {
            animation: 200,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: () => {
                const newOrder = Array.from(grid.querySelectorAll('.calc-column'))
                    .map(el => el.dataset.id);
                
                // Reorder state.columns based on newOrder
                const reorderedColumns = newOrder.map(id => 
                    state.columns.find(c => c.id.toString() === id.toString())
                ).filter(Boolean);
                
                state.columns = reorderedColumns;
                saveState();
                // We don't necessarily need to render() again because Sortable already moved the DOM
                // But we might need to if other things depend on colIndex.
                // In our case, createRowElement uses colIndex which might be stale now.
                // So it's safer to re-render.
                render();
            }
        });
    }

    function renderColumnRows(colIndex, colEl = null) {
        if (!colEl) {
            colEl = document.querySelector(`.calc-column[data-id="${state.columns[colIndex].id}"]`);
        }
        if (!colEl) return;

        const rowsContainer = colEl.querySelector('.rows-container');
        const col = state.columns[colIndex];
        const existingRows = rowsContainer.querySelectorAll('.input-row');

        // Update or create rows
        col.rows.forEach((rowVal, rowIndex) => {
            let rowEl = existingRows[rowIndex];
            
            if (!rowEl) {
                // Create new row if it doesn't exist
                rowEl = createRowElement(colIndex, rowIndex, rowVal, col.type);
                rowsContainer.appendChild(rowEl);
            } else {
                // Update existing row
                const input = rowEl.querySelector('.number-input');
                if (input.value !== rowVal.v.toString()) {
                    input.value = rowVal.v;
                }

                // Update highlight
                if (rowVal.c) {
                    rowEl.dataset.highlight = "true";
                    rowEl.style.setProperty('--highlight-bg', rowVal.c);
                    rowEl.style.setProperty('--highlight-border', rowVal.c.replace('0.2', '0.4'));
                    rowEl.querySelector('.color-dot').style.background = rowVal.c;
                } else {
                    rowEl.dataset.highlight = "false";
                    rowEl.style.removeProperty('--highlight-bg');
                    rowEl.style.removeProperty('--highlight-border');
                    rowEl.querySelector('.color-dot').style.background = 'transparent';
                }

                if (col.type === 'diff') {
                    const diffDisplay = rowEl.querySelector('.diff-display');
                    if (diffDisplay) {
                        const curVal = parseFloat(rowVal.v.toString().replace(/,/g, '')) || 0;
                        const prevVal = rowIndex > 0 ? (parseFloat((col.rows[rowIndex-1].v || '0').toString().replace(/,/g, '')) || 0) : null;
                        
                        let diffVal = 0;
                        let diffClass = '';
                        if (prevVal !== null) {
                            diffVal = curVal - prevVal;
                            if (diffVal > 0) diffClass = 'diff-positive';
                            else if (diffVal < 0) diffClass = 'diff-negative';
                        }
                        
                        const displayVal = prevVal === null ? '-' : (diffVal > 0 ? `+${formatNumber(diffVal)}` : formatNumber(diffVal));
                        diffDisplay.textContent = displayVal;
                        diffDisplay.className = `diff-display ${diffClass}`;
                    }
                }
            }
        });

        // Remove extra rows if any
        if (existingRows.length > col.rows.length) {
            for (let i = col.rows.length; i < existingRows.length; i++) {
                existingRows[i].remove();
            }
        }
    }

    // Header Actions
    addColumnBtn.addEventListener('click', addColumn);
    addDiffColumnBtn.addEventListener('click', addDiffColumn);

    themeToggleBtn.addEventListener('click', () => {
        state.isLightMode = !state.isLightMode;
        applyTheme();
        saveState();
    });

    function applyTheme() {
        if (state.isLightMode) {
            document.body.classList.add('light-theme');
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            document.body.classList.remove('light-theme');
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    }

    clearAllBtn.addEventListener('click', () => {
        modalOverlay.classList.add('active');
    });

    cancelClearBtn.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
    });

    // Close color picker on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.highlight-btn')) {
            document.querySelectorAll('.color-picker-mini.active').forEach(p => {
                p.classList.remove('active');
            });
        }
    });

    confirmClearBtn.addEventListener('click', () => {
        state.columns = [
            { id: Date.now(), name: 'i幣', rows: createDefaultRows(), type: 'standard' },
            { id: Date.now() + 1, name: '鑽石', rows: createDefaultRows(), type: 'standard' },
            { id: Date.now() + 2, name: '道具卡專用', rows: createDefaultRows(), type: 'diff' }
        ];
        render();
        saveState();
        modalOverlay.classList.remove('active');
    });

    // Close modal on click outside
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');
        }
    });
});
