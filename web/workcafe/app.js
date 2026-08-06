const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://163.176.80.201:8000'
  : 'https://workcafeagent.duckdns.org';

var chartsData = null;
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // --- Navigation Logic ---
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all nav items
      navItems.forEach(nav => nav.classList.remove('active'));
      // Add active to clicked nav item
      item.classList.add('active');

      const targetId = item.getAttribute('data-target');

      // Hide all views and show target
      views.forEach(view => {
        if (view.id === targetId) {
          view.classList.add('active');
          // Trigger animations in the view
          triggerViewAnimations(view);
        } else {
          view.classList.remove('active');
        }
      });
    });
  });

  // --- Animations ---
  function triggerViewAnimations(view) {
    // Reveal characters
    const charReveals = view.querySelectorAll('.char-reveal');
    charReveals.forEach(el => {
      if (!el.classList.contains('split')) {
        const text = el.innerText;
        el.innerHTML = '';
        text.split('').forEach((char, i) => {
          const span = document.createElement('span');
          span.className = 'char';
          span.style.transitionDelay = `${i * 0.03}s`;
          span.innerHTML = char === ' ' ? '&nbsp;' : char;
          el.appendChild(span);
          
          // Trigger reflow then add revealed
          setTimeout(() => span.classList.add('revealed'), 50);
        });
        el.classList.add('split');
      } else {
        // Re-trigger if already split
        const chars = el.querySelectorAll('.char');
        chars.forEach(char => {
          char.classList.remove('revealed');
          setTimeout(() => char.classList.add('revealed'), 50);
        });
      }
    });

    // Animate counters
    const counters = view.querySelectorAll('.counter');
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'), 10);
      animateCounter(counter, target);
    });
  }

  function animateCounter(counter, target) {
    const duration = 1500; // ms
    const start = performance.now();
    const initial = parseInt(counter.innerText.replace(/\./g, ''), 10) || 0;
    
    function update(currentTime) {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing (easeOutExpo)
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.floor(initial + (target - initial) * ease);
      
      // Format with dots if > 999
      counter.innerText = current.toLocaleString('pt-BR');
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        counter.innerText = target.toLocaleString('pt-BR');
        counter.setAttribute('data-target', target);
      }
    }
    requestAnimationFrame(update);
  }

  // Trigger animations for the initially active view
  const activeView = document.querySelector('.view.active');
  if (activeView) {
    triggerViewAnimations(activeView);
  }

  // --- Dashboard Tabs Logic ---
  const dashTabs = document.querySelectorAll('.dash-tab');
  const dashPanes = document.querySelectorAll('.dash-pane');
  let currentTab = 'faturamento';

  dashTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      if (currentTab === targetTab) return;
      
      dashTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      dashPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === 'pane-' + targetTab) {
          pane.classList.add('active');
        }
      });
      
      currentTab = targetTab;
      drawActiveChart();
    });
  });

  // --- Chart Drawing Functions ---
  function getColors() {
    const rs = getComputedStyle(document.documentElement);
    return {
      terracotta: rs.getPropertyValue('--color-terracotta').trim() || '#CA6853',
      stone900: rs.getPropertyValue('--color-stone-900').trim() || '#1c1917',
      stone500: rs.getPropertyValue('--color-stone-500').trim() || '#78716c',
      amber: rs.getPropertyValue('--color-amber').trim() || '#D4F268',
      bgLight: rs.getPropertyValue('--color-bg-light').trim() || '#EAE8DE',
      white: rs.getPropertyValue('--color-white').trim() || '#ffffff'
    };
  }

  function setupCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    return { ctx, width: rect.width, height: rect.height };
  }

  // Animation utility
  const activeAnimations = new Map();
  function animate(id, duration, render) {
    if (activeAnimations.has(id)) cancelAnimationFrame(activeAnimations.get(id));
    const start = performance.now();
    function loop(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      render(ease);
      if (p < 1) activeAnimations.set(id, requestAnimationFrame(loop));
    }
    activeAnimations.set(id, requestAnimationFrame(loop));
  }

  function drawLineChart(canvasId = 'lineChart') {
    const canvasInfo = setupCanvas(canvasId);
    if (!canvasInfo) return;
    const { ctx, width, height } = canvasInfo;
    const colors = getColors();

    const padding = { top: 30, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    let data = [];
    let labels = [];

    if (typeof chartsData !== 'undefined' && chartsData && chartsData.charts) {
      const cData = chartsData.charts.find(c => c.id === 'vendas_por_mes');
      if (cData && cData.datasets && cData.datasets.length > 0) {
        labels = cData.labels;
        data = cData.datasets[0].data;
      }
    }

    let maxVal = Math.max(...data);
    maxVal = maxVal > 0 ? maxVal * 1.2 : 400;
    const step = maxVal / 4;

    animate(canvasId, 1000, (progress) => {
      ctx.clearRect(0, 0, width, height);

      // Axes
      ctx.beginPath();
      ctx.strokeStyle = colors.stone500;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + chartH - (i * chartH / 4);
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        
        ctx.fillStyle = colors.stone500;
        ctx.font = '12px "Instrument Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        const labelVal = Math.round(i * step);
        const labelText = labelVal >= 1000 ? Math.round(labelVal / 1000) + 'k' : labelVal;
        ctx.fillText(labelText, padding.left - 10, y);
      }
      ctx.strokeStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(38, 38, 36, 0.1)';
      ctx.stroke();

      // Line
      const drawPoints = Math.floor(data.length * progress);
      const remainder = (data.length * progress) - drawPoints;

      ctx.beginPath();
      ctx.strokeStyle = colors.terracotta;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';

      for (let i = 0; i <= drawPoints; i++) {
        if (i === data.length) break;
        const x = padding.left + (i * chartW / (data.length - 1));
        const y = padding.top + chartH - (data[i] / maxVal * chartH);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Draw partial segment if animating
      if (drawPoints < data.length - 1 && drawPoints >= 0) {
        const x1 = padding.left + (drawPoints * chartW / (data.length - 1));
        const y1 = padding.top + chartH - (data[drawPoints] / maxVal * chartH);
        const x2 = padding.left + ((drawPoints + 1) * chartW / (data.length - 1));
        const y2 = padding.top + chartH - (data[drawPoints + 1] / maxVal * chartH);
        
        const currX = x1 + (x2 - x1) * remainder;
        const currY = y1 + (y2 - y1) * remainder;
        ctx.lineTo(currX, currY);
      }
      ctx.stroke();

      // Points & Labels
      data.forEach((val, i) => {
        if (i > drawPoints) return; // Only draw points that are revealed
        const x = padding.left + (i * chartW / (data.length - 1));
        const y = padding.top + chartH - (val / maxVal * chartH);
        
        ctx.beginPath();
        ctx.fillStyle = colors.amber;
        ctx.strokeStyle = colors.terracotta;
        ctx.lineWidth = 2;
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = colors.stone900;
        ctx.font = '12px "Instrument Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(labels[i], x, padding.top + chartH + 10);
      });
    });
  }

  function drawMiniSparkline(canvasId = 'miniSparkline') {
    const canvasInfo = setupCanvas(canvasId);
    if (!canvasInfo) return;
    const { ctx, width, height } = canvasInfo;
    const colors = getColors();

    const data = [38, 39, 39.5, 40, 41, 41.5, 42.5]; // Ticket Médio mock progression
    const maxVal = 45;
    const minVal = 35;

    animate(canvasId, 800, (progress) => {
      ctx.clearRect(0, 0, width, height);

      const drawPoints = Math.floor(data.length * progress);
      const remainder = (data.length * progress) - drawPoints;

      ctx.beginPath();
      ctx.strokeStyle = colors.terracotta;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      for (let i = 0; i <= drawPoints; i++) {
        if (i === data.length) break;
        const x = i * (width / (data.length - 1));
        const y = height - ((data[i] - minVal) / (maxVal - minVal) * height);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      if (drawPoints < data.length - 1 && drawPoints >= 0) {
        const x1 = drawPoints * (width / (data.length - 1));
        const y1 = height - ((data[drawPoints] - minVal) / (maxVal - minVal) * height);
        const x2 = (drawPoints + 1) * (width / (data.length - 1));
        const y2 = height - ((data[drawPoints + 1] - minVal) / (maxVal - minVal) * height);
        
        const currX = x1 + (x2 - x1) * remainder;
        const currY = y1 + (y2 - y1) * remainder;
        ctx.lineTo(currX, currY);
      }
      ctx.stroke();
    });
  }

  function drawStackedBarChartMargem(canvasId = 'barChartMargem') {
    const canvasInfo = setupCanvas(canvasId);
    if (!canvasInfo) return;
    const { ctx, width, height } = canvasInfo;
    const colors = getColors();

    const padding = { top: 40, right: 40, bottom: 20, left: 160 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    let data = [];

    if (typeof chartsData !== 'undefined' && chartsData && chartsData.charts) {
      const cData = chartsData.charts.find(c => c.id === 'margem_por_produto');
      if (cData && cData.datasets && cData.datasets.length > 0) {
        data = cData.labels.map((lbl, idx) => ({
          label: lbl,
          bruta: cData.datasets[0].data[idx] || 0
        }));
      }
    }
    
    let barH = (chartH * 0.7) / data.length;
    if (barH > 24) barH = 24;
    if (barH < 6) barH = 6;
    let groupH = barH;
    let spacing = (chartH - (data.length * groupH)) / (data.length + 1);

    animate(canvasId, 800, (progress) => {
      ctx.clearRect(0, 0, width, height);

      // Draw legend
      ctx.fillStyle = colors.stone900;
      ctx.font = '12px "Instrument Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      // Margem Bruta
      ctx.fillStyle = '#e8a87c';
      ctx.fillRect(padding.left, 10, 12, 12);
      ctx.fillStyle = colors.stone900;
      ctx.fillText('Margem Bruta', padding.left + 20, 16);

      data.forEach((item, i) => {
        const y = padding.top + spacing + i * (groupH + spacing);
        
        // Label
        ctx.fillStyle = colors.stone900;
        ctx.font = '13px "Instrument Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        let displayLabel = item.label;
        if (displayLabel.length > 25) {
            displayLabel = displayLabel.substring(0, 22) + '...';
        }
        ctx.fillText(displayLabel, padding.left - 15, y + groupH/2);

        // Bruta Bar
        const wBruta = chartW * (item.bruta / 100) * progress;
        ctx.fillStyle = '#e8a87c';
        ctx.beginPath();
        ctx.roundRect(padding.left, y, wBruta, barH, barH/2);
        ctx.fill();

        if (progress > 0.8) {
          ctx.fillStyle = colors.stone900;
          ctx.textAlign = 'left';
          const valStr = typeof item.bruta === 'number' ? item.bruta.toFixed(1).replace('.', ',') : item.bruta;
          ctx.fillText(valStr + '%', padding.left + wBruta + 10, y + barH/2);
        }
      });
    });
  }

  function drawDonutChartContrib(canvasId = 'donutChartContrib', legendId = 'donutLegendContrib') {
    let canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    // Remove old event listeners
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    canvas = newCanvas;
    
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    
    // Set actual resolution
    const width = 300;
    const height = 300;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Maintain CSS size
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height, 240);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    let data = [];

    if (typeof chartsData !== 'undefined' && chartsData && chartsData.charts) {
      const cData = chartsData.charts.find(c => c.id === 'margem_por_produto');
      if (cData && cData.datasets && cData.datasets.length > 0) {
        const defaultColors = [colors.terracotta, colors.stone500, colors.amber, '#4a4543', '#9a8c98'];
        data = cData.labels.map((lbl, idx) => ({
          label: lbl,
          value: cData.datasets[0].data[idx] || 0,
          color: defaultColors[idx % defaultColors.length]
        }));
      }
    }
    
    const total = data.reduce((sum, d) => sum + d.value, 0) || 100;
    const cx = width / 2;
    const cy = height / 2;
    const outerR = 120;
    const innerR = 80;

    const legend = document.getElementById(legendId);
    if (legend) {
      legend.innerHTML = data.map(d => `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${d.color};"></div>
            <span class="text-body">${d.label}</span>
          </div>
          <span class="text-body" style="font-weight: 600;">${typeof d.value === 'number' ? d.value.toFixed(1).replace('.', ',') : d.value}%</span>
        </div>
      `).join('');
    }

    let hoveredIndex = -1;

    function renderDonut(progress) {
      ctx.clearRect(0, 0, width, height);
      
      let startAngle = -0.5 * Math.PI;
      const targetAngle = startAngle + (Math.PI * 2 * progress);

      for (let i = 0; i < data.length; i++) {
        const sliceAngle = (data[i].value / total) * Math.PI * 2;
        let endAngle = startAngle + sliceAngle;
        
        if (startAngle > targetAngle) break;
        if (endAngle > targetAngle) endAngle = targetAngle;

        ctx.beginPath();
        ctx.fillStyle = data[i].color;
        
        if (progress === 1 && i === hoveredIndex) {
          ctx.arc(cx, cy, outerR + 5, startAngle, endAngle);
          ctx.arc(cx, cy, innerR - 5, endAngle, startAngle, true);
        } else {
          ctx.arc(cx, cy, outerR, startAngle, endAngle);
          ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        }
        ctx.fill();

        startAngle += sliceAngle;
      }
      
      // Center Text
      if (progress === 1 && hoveredIndex >= 0 && hoveredIndex < data.length) {
        const item = data[hoveredIndex];
        const valText = typeof item.value === 'number' ? item.value.toFixed(1).replace('.', ',') + '%' : item.value + '%';
        
        ctx.fillStyle = colors.stone900;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let displayLabel = item.label;
        if (displayLabel.length > 15) {
            displayLabel = displayLabel.substring(0, 12) + '...';
        }
        
        ctx.font = 'bold 24px "Instrument Sans", sans-serif';
        ctx.fillText(valText, cx, cy - 10);
        
        ctx.fillStyle = colors.stone500;
        ctx.font = '12px "Instrument Sans", sans-serif';
        ctx.fillText(displayLabel, cx, cy + 18);
      }
    }

    canvas.addEventListener('mousemove', (e) => {
      const cr = canvas.getBoundingClientRect();
      const mx = e.clientX - cr.left;
      const my = e.clientY - cr.top;
      const cssCx = cr.width / 2;
      const cssCy = cr.height / 2;
      const dx = mx - cssCx;
      const dy = my - cssCy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const scaledDist = cr.width > 0 ? dist * (300 / cr.width) : 0;

      if (scaledDist >= (innerR - 5) && scaledDist <= (outerR + 5)) {
        let angle = Math.atan2(dy, dx);
        let normalizedAngle = angle + 0.5 * Math.PI;
        if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
        
        let currentAngle = 0;
        let newHoveredIndex = -1;
        for (let i = 0; i < data.length; i++) {
          const sliceAngle = (data[i].value / total) * Math.PI * 2;
          if (normalizedAngle >= currentAngle && normalizedAngle < currentAngle + sliceAngle) {
            newHoveredIndex = i;
            break;
          }
          currentAngle += sliceAngle;
        }
        
        if (hoveredIndex !== newHoveredIndex) {
          hoveredIndex = newHoveredIndex;
          renderDonut(1);
        }
      } else {
        if (hoveredIndex !== -1) {
          hoveredIndex = -1;
          renderDonut(1);
        }
      }
    });

    canvas.addEventListener('mouseleave', () => {
      if (hoveredIndex !== -1) {
        hoveredIndex = -1;
        renderDonut(1);
      }
    });

    animate(canvasId, 800, renderDonut);
  }

  function drawBarChartEstoque(canvasId = 'barChartEstoque') {
    const canvasInfo = setupCanvas(canvasId);
    if (!canvasInfo) return;
    const { ctx, width, height } = canvasInfo;
    const colors = getColors();

    const padding = { top: 40, right: 40, bottom: 20, left: 160 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    let data = [];

    if (typeof chartsData !== 'undefined' && chartsData && chartsData.charts) {
      const cData = chartsData.charts.find(c => c.id === 'estoque_vs_minimo');
      if (cData && cData.datasets && cData.datasets.length > 0) {
        data = cData.labels.map((lbl, idx) => ({
          label: lbl,
          atual: cData.datasets[0].data[idx] || 0,
          min: (cData.datasets[1] ? cData.datasets[1].data[idx] : 0) || 0
        }));
      }
    }
    
    if (canvasId === 'barChartEstoque') {
      const alertList = document.getElementById('estoqueAlertList');
      if (alertList) {
        const criticos = data.filter(d => d.atual < d.min);
        if (criticos.length > 0) {
          alertList.innerHTML = criticos.map(d => `
            <li class="alert-item">
              <span class="alert-dot"></span>
              <div class="alert-info">
                <span class="alert-name">${d.label}</span>
                <span class="alert-desc">Atual: ${typeof d.atual === 'number' ? d.atual.toString().replace('.', ',') : d.atual} | Mín: ${typeof d.min === 'number' ? d.min.toString().replace('.', ',') : d.min}</span>
              </div>
            </li>
          `).join('');
        } else {
          alertList.innerHTML = `
            <li class="alert-item" style="display: block; text-align: center; color: var(--color-stone-500); padding-top: 1rem;">
              <span class="alert-desc" style="font-size: 0.95rem; font-style: italic;">Nenhum item crítico no momento</span>
            </li>
          `;
        }
      }
    }

    let maxVal = 100;
    if (data.length > 0) {
      maxVal = Math.max(...data.flatMap(d => [d.atual, d.min]));
      maxVal = maxVal > 0 ? maxVal * 1.15 : 100;
    }

    let groupH = (chartH * 0.75) / data.length;
    if (groupH > 28) groupH = 28;
    let barH = (groupH - 2) / 2;
    if (barH < 4) barH = 4;
    groupH = barH * 2 + 2;
    
    let spacing = (chartH - (data.length * groupH)) / (data.length + 1);

    animate(canvasId, 800, (progress) => {
      ctx.clearRect(0, 0, width, height);

      // Draw legend
      ctx.fillStyle = colors.terracotta;
      ctx.beginPath();
      ctx.roundRect(padding.left, 10, 12, 12, 2);
      ctx.fill();
      ctx.fillStyle = colors.stone900;
      ctx.font = '12px "Instrument Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Atual', padding.left + 18, 16);

      ctx.fillStyle = colors.stone500;
      ctx.beginPath();
      ctx.roundRect(padding.left + 80, 10, 12, 12, 2);
      ctx.fill();
      ctx.fillStyle = colors.stone900;
      ctx.fillText('Mínimo', padding.left + 98, 16);

      data.forEach((item, i) => {
        const y = padding.top + spacing + i * (groupH + spacing);
        
        ctx.fillStyle = colors.stone900;
        ctx.font = '13px "Instrument Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        let displayLabel = item.label;
        if (displayLabel.length > 25) {
            displayLabel = displayLabel.substring(0, 22) + '...';
        }
        ctx.fillText(displayLabel, padding.left - 15, y + groupH/2);

        // Mínimo Bar
        const minW = chartW * (item.min / maxVal) * progress;
        ctx.fillStyle = colors.stone500;
        ctx.beginPath();
        ctx.roundRect(padding.left, y + barH + 2, minW, barH, barH/2);
        ctx.fill();

        // Atual Bar
        const atualW = chartW * (item.atual / maxVal) * progress;
        ctx.fillStyle = colors.terracotta;
        ctx.beginPath();
        ctx.roundRect(padding.left, y, atualW, barH, barH/2);
        ctx.fill();
        
        if (progress > 0.8) {
          ctx.fillStyle = colors.stone900;
          ctx.textAlign = 'left';
          ctx.font = '11px "Instrument Sans", sans-serif';
          
          const valAtual = typeof item.atual === 'number' ? item.atual.toFixed(1).replace('.0', '').replace('.', ',') : item.atual;
          const valMin = typeof item.min === 'number' ? item.min.toFixed(1).replace('.0', '').replace('.', ',') : item.min;
          
          ctx.fillText(valAtual, padding.left + atualW + 6, y + barH/2);
          ctx.fillText(valMin, padding.left + minW + 6, y + barH + 2 + barH/2);
        }
      });
    });
  }

  function drawDonutChartDocs(canvasId = 'donutChartDocs', legendId = 'donutLegend') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    
    // Set actual resolution
    const width = 300;
    const height = 300;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const radius = Math.min(width, height) / 2 - 20;
    const centerX = width / 2;
    const centerY = height / 2;

    let data = [
      { label: 'Treinamento', chunks: 156, color: colors.terracotta },
      { label: 'Jurídico', chunks: 45, color: '#4a4543' },
      { label: 'Logística', chunks: 24, color: '#9a8c98' },
      { label: 'RH', chunks: 40, color: '#7a8b6e' },
      { label: 'Marketing', chunks: 15, color: '#c9ada7' }
    ];

    if (typeof chartsData !== 'undefined' && chartsData && chartsData.charts) {
      const cData = chartsData.charts.find(c => c.id === 'distribuicao_categorias');
      if (cData && cData.datasets && cData.datasets.length > 0) {
        const defaultColors = [colors.terracotta, '#4a4543', '#9a8c98', '#7a8b6e', '#c9ada7'];
        data = cData.labels.map((lbl, idx) => ({
          label: lbl,
          chunks: cData.datasets[0].data[idx] || 0,
          color: defaultColors[idx % defaultColors.length]
        }));
      }
    }

    const total = data.reduce((sum, d) => sum + d.chunks, 0) || 1;

    // Build Legend HTML once
    const legendContainer = document.getElementById(legendId);
    if (legendContainer) {
      legendContainer.innerHTML = '';
      data.forEach(item => {
        const pct = Math.round((item.chunks / total) * 100);
        legendContainer.innerHTML += `
          <div class="legend-item">
            <div class="legend-color" style="background-color: ${item.color}"></div>
            <div class="legend-text">
              <span class="legend-name">${item.label} (${pct}%)</span>
              <span class="legend-stats">${item.chunks} chunks</span>
            </div>
          </div>
        `;
      });
    }

    animate(canvasId, 800, (progress) => {
      ctx.clearRect(0, 0, width, height);
      
      let startAngle = -0.5 * Math.PI;

      data.forEach(item => {
        const sliceAngle = (item.chunks / total) * 2 * Math.PI * progress;
        
        ctx.beginPath();
        ctx.fillStyle = item.color;
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.fill();
        
        startAngle += sliceAngle;
      });

      // Inner circle for donut
      ctx.beginPath();
      ctx.fillStyle = colors.white;
      ctx.arc(centerX, centerY, radius * 0.65, 0, 2 * Math.PI);
      ctx.fill();

      // Center text
      ctx.fillStyle = colors.stone900;
      ctx.font = '600 32px "Instrument Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.floor(total * progress), centerX, centerY - 10);
      
      ctx.fillStyle = colors.stone500;
      ctx.font = '14px "Instrument Sans", sans-serif';
      ctx.fillText('chunks', centerX, centerY + 20);
    });
  }

  // --- Correlações Logic ---
  const corrSelectA = document.getElementById('corrSelectA');
  const corrSelectB = document.getElementById('corrSelectB');
  const corrChartA = document.getElementById('corrChartA');
  const corrChartB = document.getElementById('corrChartB');
  const btnAnalyzeCorr = document.getElementById('btnAnalyzeCorr');
  const corrAnalysisText = document.getElementById('corrAnalysisText');

  function getCorrChartHTML(type, side) {
    const canvasId = `corrCanvas${side}`;
    const legendId = `corrLegend${side}`;
    
    if (type === 'fornecedores') {
      return `
        <div style="width: 100%; height: 100%; overflow: auto; padding-right: 8px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <tbody id="corrFornTableBody${side}"></tbody>
          </table>
        </div>
      `;
    }
    
    if (type === 'basedocs') {
      return `
        <div class="donut-layout" style="gap: 1.5rem; width:100%; height:100%; justify-content: center; align-items: center;">
          <div class="donut-canvas-container" style="flex-shrink: 0; width: 200px; height: 200px;">
            <canvas id="${canvasId}" style="width: 100%; height: 100%;"></canvas>
          </div>
          <div id="${legendId}" class="donut-legend"></div>
        </div>
      `;
    }
    
    return `<canvas id="${canvasId}" style="width: 100%; height: 100%;"></canvas>`;
  }

  function drawCorrChart(type, side) {
    const canvasId = `corrCanvas${side}`;
    const legendId = `corrLegend${side}`;
    switch(type) {
      case 'faturamento': drawLineChart(canvasId); break;
      case 'margem': drawStackedBarChartMargem(canvasId); break;
      case 'estoque': drawBarChartEstoque(canvasId); break;
      case 'basedocs': drawDonutChartDocs(canvasId, legendId); break;
      case 'fornecedores': drawFornecedoresTable(side); break;
    }
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function drawCorrelacoes() {
    const typeA = corrSelectA.value;
    const typeB = corrSelectB.value;
    
    // Inject HTML
    corrChartA.innerHTML = getCorrChartHTML(typeA, 'A');
    corrChartB.innerHTML = getCorrChartHTML(typeB, 'B');
    
    // Animate charts with slight delay to ensure DOM is ready
    setTimeout(() => {
      drawCorrChart(typeA, 'A');
      drawCorrChart(typeB, 'B');
    }, 50);
  }

  if (corrSelectA) {
    corrSelectA.addEventListener('change', () => {
      drawCorrelacoes();
      resetCorrAnalysis();
    });
  }
  if (corrSelectB) {
    corrSelectB.addEventListener('change', () => {
      drawCorrelacoes();
      resetCorrAnalysis();
    });
  }

  function resetCorrAnalysis() {
    corrAnalysisText.style.opacity = '0';
    setTimeout(() => {
      corrAnalysisText.innerHTML = `
        <p style="font-style: italic; color: var(--color-stone-500);" class="font-serif">
          Selecione dois conjuntos de dados e clique em Analisar para ver a correlação.
        </p>
      `;
      corrAnalysisText.style.opacity = '1';
    }, 200);
    const insightsLabel = document.getElementById('insightsLabel');
    if (insightsLabel) insightsLabel.style.display = 'none';
  }

  const typeMapping = {
    'faturamento': 'Faturamento',
    'margem': 'Margem',
    'estoque': 'Estoque',
    'fornecedores': 'Fornecedores',
    'basedocs': 'Base de Docs'
  };

  if (btnAnalyzeCorr) {
    btnAnalyzeCorr.addEventListener('click', async () => {
      const selectedA = typeMapping[corrSelectA.value];
      const selectedB = typeMapping[corrSelectB.value];

      const originalBtnHTML = btnAnalyzeCorr.innerHTML;
      btnAnalyzeCorr.disabled = true;
      btnAnalyzeCorr.innerHTML = `
        <div class="typing-indicator" style="display: flex; gap: 4px; justify-content: center; align-items: center; height: 100%;">
          <div class="typing-dot" style="background-color: currentColor;"></div>
          <div class="typing-dot" style="background-color: currentColor;"></div>
          <div class="typing-dot" style="background-color: currentColor;"></div>
        </div>
      `;

      corrAnalysisText.style.opacity = '0';
      await new Promise(resolve => setTimeout(resolve, 200));

      const skeletonCard = `
        <div style="background-color: var(--color-white); border-radius: var(--radius-xl); border: 1px solid var(--border-light); padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 1rem;">
          <div class="pulse-anim" style="width: 60px; height: 12px; background-color: var(--border-light); border-radius: 4px;"></div>
          <div class="pulse-anim" style="width: 70%; height: 20px; background-color: var(--border-light); border-radius: 4px;"></div>
          <div class="pulse-anim" style="width: 100%; height: 48px; background-color: var(--border-light); border-radius: 4px;"></div>
          <div class="pulse-anim" style="width: 100%; height: 60px; background-color: var(--border-light); border-radius: 4px;"></div>
        </div>
      `;
      corrAnalysisText.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; width: 100%;">
          ${skeletonCard.repeat(4)}
        </div>
      `;
      corrAnalysisText.style.opacity = '1';

      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        const response = await fetch(`${API_BASE}/correlate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_a: selectedA, dataset_b: selectedB })
        });
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        const insightsHTML = (data.insights || []).map((insight, index) => `
          <div style="background-color: var(--color-white); border-radius: var(--radius-xl); border: 1px solid var(--border-light); padding: 1.5rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.75rem; opacity: 0; animation: slideUp 0.4s ease forwards; animation-delay: ${index * 0.1}s;">
            <h4 class="font-serif" style="font-size: 16px; font-weight: 600; color: var(--color-terracotta); text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">${insight.titulo || ''}</h4>
            <p class="font-sans" style="font-size: 1.05rem; font-weight: 500; color: var(--color-stone-900); border-left: 3px solid var(--color-terracotta); padding-left: 0.75rem; margin: 0;">${insight.resumo || ''}</p>
            <p class="font-sans" style="font-size: 0.95rem; color: var(--color-stone-600); line-height: 1.5; margin: 0;">${insight.detalhe || ''}</p>
          </div>
        `).join('');

        const gridHTML = `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; width: 100%;">
            ${insightsHTML}
          </div>
        `;
        
        corrAnalysisText.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 200));
        
        corrAnalysisText.innerHTML = gridHTML;
        corrAnalysisText.style.opacity = '1';
        
        const insightsLabel = document.getElementById('insightsLabel');
        if (insightsLabel) insightsLabel.style.display = 'block';

      } catch (error) {
        corrAnalysisText.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 200));
        
        corrAnalysisText.innerHTML = `
          <div style="display: flex; justify-content: center; align-items: center; width: 100%; padding: 2rem;">
            <p style="color: var(--color-stone-500); font-style: italic;" class="font-serif">Não foi possível gerar os insights. Tente novamente.</p>
          </div>
        `;
        corrAnalysisText.style.opacity = '1';
      } finally {
        btnAnalyzeCorr.disabled = false;
        btnAnalyzeCorr.innerHTML = originalBtnHTML;
      }
    });
  }

  function drawFornecedoresTable(side = '') {
    const tbodyId = side ? `corrFornTableBody${side}` : 'fornecedoresTableBody';
    const resumoId = side ? `corrFornResumo${side}` : 'fornecedoresResumo';
    const tbody = document.getElementById(tbodyId);
    const resumo = document.getElementById(resumoId);
    
    if (!tbody) return;

    let nodes = [];
    let edges = [];

    if (typeof chartsData !== 'undefined' && chartsData && chartsData.charts) {
      const cData = chartsData.charts.find(c => c.id === 'rede_fornecedores');
      if (cData) {
        let n = cData.nodes;
        let e = cData.edges;
        if (!n && cData.datasets && cData.datasets.length > 0) {
            n = cData.datasets[0].nodes || (cData.datasets[0].data && cData.datasets[0].data.nodes);
            e = cData.datasets[0].edges || (cData.datasets[0].data && cData.datasets[0].data.edges);
        }
        
        if (n && e) {
          nodes = JSON.parse(JSON.stringify(n));
          edges = JSON.parse(JSON.stringify(e));
        }
      }
    }

    if (nodes.length === 0) {
       tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 2rem; color: var(--color-stone-500); font-style: italic;">Nenhum dado de fornecedor disponível.</td></tr>';
       resumo.textContent = "0 fornecedores · 0 categorias";
       return;
    }

    const fornNodes = nodes.filter(n => n.type === 'fornecedor');
    const catNodes = nodes.filter(n => n.type === 'categoria');
    
    if (resumo) {
      resumo.textContent = `${fornNodes.length} fornecedores · ${catNodes.length} categorias`;
    }

    const fornMap = {};
    fornNodes.forEach(f => {
       fornMap[f.id] = { id: f.id, categorias: [] };
    });

    edges.forEach(e => {
       const source = e.source.id || e.source;
       const target = e.target.id || e.target;
       if (fornMap[source]) {
          fornMap[source].categorias.push(target);
       }
    });

    const rows = Object.values(fornMap);
    rows.sort((a, b) => b.categorias.length - a.categorias.length);

    tbody.innerHTML = rows.map((row) => {
       const pillsHTML = row.categorias.map(cat => 
         `<span style="display: inline-block; background-color: rgba(107, 143, 113, 0.15); color: var(--color-stone-900); border: 1px solid rgba(107, 143, 113, 0.3); border-radius: 99px; padding: 4px 8px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; white-space: normal; line-height: 1.2;">${cat}</span>`
       ).join('');

       return `
         <tr style="border-bottom: 1px solid var(--border-light); transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(38, 38, 36, 0.03)'" onmouseout="this.style.backgroundColor='transparent'">
           <td style="padding: 1rem 1.5rem; font-family: 'Instrument Sans', sans-serif; font-weight: 500; color: var(--color-stone-900);">${row.id}</td>
           <td style="padding: 1rem 1.5rem; font-family: 'Instrument Sans', sans-serif;">
             <div style="display: flex; flex-wrap: wrap; margin-bottom: -6px;">${pillsHTML || '<span style="color: var(--color-stone-400);">-</span>'}</div>
           </td>
           ${!side ? `<td style="padding: 1rem 1.5rem; font-family: 'Instrument Sans', sans-serif; font-weight: 600; color: var(--color-terracotta); text-align: center;">${row.categorias.length}</td>` : ''}
         </tr>
       `;
    }).join('');
  }

  function drawActiveChart() {
    switch(currentTab) {
      case 'faturamento': drawLineChart(); drawMiniSparkline(); break;
      case 'margem': drawStackedBarChartMargem(); drawDonutChartContrib(); break;
      case 'estoque': drawBarChartEstoque(); break;
      case 'basedocs': drawDonutChartDocs(); break;
      case 'correlacoes': drawCorrelacoes(); break;
      case 'fornecedores': drawFornecedoresTable(); break;
    }
  }

  // Theme Toggle Logic
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  if (themeToggle) {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      themeIcon.setAttribute('data-lucide', 'sun');
    }
    
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('workcafe-theme', 'light');
        themeIcon.setAttribute('data-lucide', 'moon');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('workcafe-theme', 'dark');
        themeIcon.setAttribute('data-lucide', 'sun');
      }
      
      if (window.lucide) window.lucide.createIcons();
      drawActiveChart();
    });
  }

  // --- Utility logic ---
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const style = document.createElement('style');
  style.textContent = `
    @keyframes subtlePulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.98); }
      100% { opacity: 1; transform: scale(1); }
    }
    .pulse-anim {
      animation: subtlePulse 1.5s infinite ease-in-out;
    }
  `;
  document.head.appendChild(style);

  // --- Data & WebSocket Logic ---
  function updateKPIs() {
    if (!chartsData || !chartsData.charts) return;

    // Faturamento KPIs
    const faturamentoChart = chartsData.charts.find(c => c.id === 'vendas_por_mes');
    if (faturamentoChart && faturamentoChart.datasets && faturamentoChart.datasets.length > 0) {
      const faturamentoData = faturamentoChart.datasets[0].data;
      const totalAno = faturamentoData.reduce((acc, val) => acc + val, 0);
      
      const elFaturamentoTotal = document.getElementById('faturamentoTotalAno');
      const elFaturamentoDelta = document.getElementById('faturamentoDeltaAno');
      
      if (elFaturamentoTotal && elFaturamentoDelta) {
        if (totalAno > 1000000) {
          elFaturamentoTotal.textContent = `R$ ${(totalAno / 1000000).toFixed(1).replace('.', ',')}M`;
        } else {
          elFaturamentoTotal.textContent = formatCurrency(totalAno);
        }
        
        const base = 2990093.64;
        const varAno = ((totalAno - base) / base) * 100;
        const isPos = varAno >= 0;
        const sign = isPos ? '+' : '';
        const color = isPos ? '#7a8b6e' : '#ca6853';
        elFaturamentoDelta.innerHTML = `<span style="color: ${color}; font-weight: 600;">${sign}${varAno.toFixed(1).replace('.', ',')}%</span> vs ano anterior`;
      }
      
      // Ticket Médio
      if (faturamentoChart.datasets.length > 1) {
        const ticketData = faturamentoChart.datasets[1].data;
        if (ticketData && ticketData.length > 0) {
          const avgTicket = ticketData.reduce((a, b) => a + b, 0) / ticketData.length;
          const elTicketValor = document.getElementById('ticketMedioValor');
          const elTicketDelta = document.getElementById('ticketMedioDeltaMes');
          
          if (elTicketValor && elTicketDelta) {
             elTicketValor.textContent = formatCurrency(avgTicket);
             
             if (ticketData.length >= 2) {
               const last = ticketData[ticketData.length - 1];
               const prev = ticketData[ticketData.length - 2];
               const varTicket = prev ? ((last - prev) / prev) * 100 : 0;
               const tIsPos = varTicket >= 0;
               const tSign = tIsPos ? '+' : '';
               const tColor = tIsPos ? '#7a8b6e' : '#ca6853';
               elTicketDelta.innerHTML = `<span style="color: ${tColor}; font-weight: 600;">${tSign}${varTicket.toFixed(1).replace('.', ',')}%</span> vs mês anterior`;
             }
          }
        }
      }
    }
  }

  async function fetchInitialChartsData() {
    try {
      const res = await fetch(`${API_BASE}/charts`);
      if (res.ok) {
        chartsData = await res.json();
        updateKPIs();
        drawActiveChart();
      } else {
        console.error('Failed to fetch charts data, keeping mock data');
      }
    } catch (e) {
      console.error('Error fetching charts data, keeping mock data', e);
    }
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  function renderKPIs(kpis) {
    if (!kpis) {
      renderKPIsError();
      return;
    }
    
    // Faturamento Mensal
    const fatContent = document.getElementById('kpi-content-faturamento');
    if (fatContent && kpis.faturamento_mensal) {
      const valor = kpis.faturamento_mensal.valor;
      const variacao = kpis.faturamento_mensal.variacao_percentual;
      const isPositive = variacao >= 0;
      const deltaColor = isPositive ? '#7a8b6e' : '#ca6853';
      const deltaSign = isPositive ? '+' : '';
      const varText = typeof variacao === 'number' ? variacao.toFixed(1).replace('.', ',') : variacao;
      
      fatContent.innerHTML = `
        <div style="display: flex; align-items: baseline;">
          <span class="text-kpi">${formatCurrency(valor)}</span>
        </div>
        <p class="text-body" style="margin-top: 0.5rem;">
          <span class="delta" style="color: ${deltaColor}; font-weight: 600;">${deltaSign}${varText}%</span> vs mês anterior
        </p>
      `;
    }

    // Produto Top
    const prodContent = document.getElementById('kpi-content-produto');
    if (prodContent && kpis.produto_top) {
      const nome = kpis.produto_top.nome;
      const margem = kpis.produto_top.margem;
      const margemText = typeof margem === 'number' ? margem.toFixed(1).replace('.', ',') : margem;
      prodContent.innerHTML = `
        <span class="text-kpi">${nome}</span>
        <p class="text-body" style="margin-top: 0.5rem;">Margem: ${margemText}%</p>
      `;
    }

    // Docs Indexados
    const docsContent = document.getElementById('kpi-content-docs');
    if (docsContent && kpis.docs_indexados !== undefined) {
      const docs = kpis.docs_indexados;
      docsContent.innerHTML = `
        <span class="text-kpi counter" data-target="${docs}">${docs}</span>
        <p class="text-body" style="margin-top: 0.5rem;">documentos na base</p>
      `;
      
      // Animate the counter
      const counterEl = docsContent.querySelector('.counter');
      if (counterEl) animateCounter(counterEl, docs);
    }
  }

  function renderKPIsError() {
    const defaultHtml = `
      <div style="display: flex; align-items: baseline;">
        <span class="text-kpi">--</span>
      </div>
      <p class="text-body" style="margin-top: 0.5rem;">--</p>
    `;
    
    const fatContent = document.getElementById('kpi-content-faturamento');
    if (fatContent) fatContent.innerHTML = defaultHtml;

    const prodContent = document.getElementById('kpi-content-produto');
    if (prodContent) prodContent.innerHTML = `
      <span class="text-kpi">--</span>
      <p class="text-body" style="margin-top: 0.5rem;">--</p>
    `;

    const docsContent = document.getElementById('kpi-content-docs');
    if (docsContent) docsContent.innerHTML = `
      <span class="text-kpi">--</span>
      <p class="text-body" style="margin-top: 0.5rem;">--</p>
    `;
  }

  async function fetchKPIsData() {
    try {
      const res = await fetch(`${API_BASE}/charts`);
      if (res.ok) {
        const data = await res.json();
        renderKPIs(data.kpis);
      } else {
        renderKPIsError();
      }
    } catch (e) {
      console.error('Error fetching KPIs data', e);
      renderKPIsError();
    }
  }

  function initWebSocket() {
    const wsUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'ws://163.176.80.201:8000/ws/charts'
  : 'wss://workcafeagent.duckdns.org/ws/charts';
const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'charts_update') {
          chartsData = data;
          updateKPIs();
          drawActiveChart();
        } else if (data.total_chunks !== undefined) {
          const headers = Array.from(document.querySelectorAll('.card__header .text-card-title'));
          const docsHeader = headers.find(el => el.textContent.includes('Docs Indexados'));
          if (docsHeader) {
            const docsKpi = docsHeader.parentElement.nextElementSibling.querySelector('.counter');
            if (docsKpi) {
              animateCounter(docsKpi, data.total_chunks);
            }
          }
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };
  }
  
  fetchInitialChartsData();
  initWebSocket();
  fetchKPIsData();

  // --- Chat Logic ---
  const chatInput = document.querySelector('.chat-input');
  const chatSendBtn = document.querySelector('.chat-send');
  const chatMessages = document.querySelector('.chat-messages');
  const chatThreadId = generateUUID();
  const conversationHistory = [];

  function formatMarkdown(text) {
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    
    const lines = formatted.split('\n');
    let html = '';
    let inList = false;
    let listType = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      const ulMatch = line.match(/^[-*]\s+(.*)/);
      const olMatch = line.match(/^\d+\.\s+(.*)/);

      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) html += '</ol>';
          html += '<ul>';
          inList = true; listType = 'ul';
        }
        html += `<li>${ulMatch[1]}</li>`;
      } else if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) html += '</ul>';
          html += '<ol>';
          inList = true; listType = 'ol';
        }
        html += `<li>${olMatch[1]}</li>`;
      } else {
        const justClosedList = inList;
        if (inList) { 
          html += listType === 'ul' ? '</ul>' : '</ol>'; 
          inList = false; 
        }
        
        if (i > 0 && !justClosedList) {
           html += '<br>';
        }
        html += line;
      }
    }
    if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; }
    
    return html;
  }

  async function sendChatMessage() {
    const question = chatInput.value.trim();
    if (!question) return;

    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble chat-bubble--user';
    userBubble.textContent = question;

    conversationHistory.push({
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    });
    const typingBubbleContainer = document.querySelector('.typing-indicator').parentElement;
    chatMessages.insertBefore(userBubble, typingBubbleContainer);

    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    typingBubbleContainer.style.display = 'block';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, thread_id: chatThreadId })
      });
      if (!response.ok) throw new Error('API error');
      const data = await response.json();

      conversationHistory.push({
        role: 'agent',
        content: data.answer,
        timestamp: new Date().toISOString()
      });

      const sourceText = data.source ? data.source : "documentos internos";

      const agentBubble = document.createElement('div');
      agentBubble.className = 'chat-bubble chat-bubble--agent';
      agentBubble.innerHTML = `
        ${formatMarkdown(data.answer)}
        <span class="chat-citation">Fonte: ${sourceText}</span>
      `;
      chatMessages.insertBefore(agentBubble, typingBubbleContainer);
    } catch (err) {
      const errorBubble = document.createElement('div');
      errorBubble.className = 'chat-bubble chat-bubble--agent';
      errorBubble.innerHTML = `<p style="color: var(--color-terracotta);">Não foi possível obter resposta.</p>`;
      chatMessages.insertBefore(errorBubble, typingBubbleContainer);
    } finally {
      typingBubbleContainer.style.display = 'none';
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  if (chatSendBtn && chatInput) {
    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
    const typingBubbleContainer = document.querySelector('.typing-indicator').parentElement;
    if (typingBubbleContainer) typingBubbleContainer.style.display = 'none';
  }

  // --- Export Logic ---
  const btnExportChat = document.getElementById('btnExportChat');
  const exportChatDropdown = document.getElementById('exportChatDropdown');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnExportMd = document.getElementById('btnExportMd');
  const btnExportPdf = document.getElementById('btnExportPdf');

  if (btnExportChat && exportChatDropdown) {
    btnExportChat.addEventListener('click', () => {
      exportChatDropdown.style.display = exportChatDropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!btnExportChat.contains(e.target) && !exportChatDropdown.contains(e.target)) {
        exportChatDropdown.style.display = 'none';
      }
    });

    btnExportJson.addEventListener('click', () => {
      exportChatDropdown.style.display = 'none';
      const dataStr = JSON.stringify(conversationHistory, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workcafe-conversa.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    btnExportMd.addEventListener('click', () => {
      exportChatDropdown.style.display = 'none';
      let mdContent = '';
      conversationHistory.forEach(msg => {
        const date = new Date(msg.timestamp);
        const hhmm = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
        const author = msg.role === 'user' ? 'Usuário' : 'WorkCafe';
        mdContent += `**${author}** (${hhmm}):\n${msg.content}\n\n`;
      });
      const blob = new Blob([mdContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workcafe-conversa.md';
      a.click();
      URL.revokeObjectURL(url);
    });

    btnExportPdf.addEventListener('click', () => {
      exportChatDropdown.style.display = 'none';
      window.print();
    });
  }

  // --- Documents Upload Logic ---
  const uploadArea = document.querySelector('.upload-area');
  const docList = document.querySelector('.doc-list');

  if (uploadArea) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.accept = '.pdf,.docx,.xlsx,.txt';
    uploadArea.appendChild(fileInput);

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--color-terracotta)';
      uploadArea.style.backgroundColor = 'rgba(202, 104, 83, 0.05)';
    });
    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      uploadArea.style.backgroundColor = '';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      uploadArea.style.backgroundColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleUpload(e.target.files[0]);
      }
      fileInput.value = '';
    });

    async function handleUpload(file) {
      const originalHtml = uploadArea.innerHTML;
      uploadArea.style.pointerEvents = 'none';
      
      uploadArea.innerHTML = `
        <i data-lucide="loader" class="pulse-anim" style="width: 48px; height: 48px; color: var(--color-terracotta); margin-bottom: 1rem;"></i>
        <h3 class="text-card-title pulse-anim">Enviando...</h3>
      `;
      if (window.lucide) window.lucide.createIcons();

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData
        });
        if (!response.ok) throw new Error('Upload error');
        const data = await response.json();

        uploadArea.innerHTML = `
          <i data-lucide="check-circle" style="width: 48px; height: 48px; color: #7a8b6e; margin-bottom: 1rem;"></i>
          <h3 class="text-card-title">${data.message || 'Enviado com sucesso'}</h3>
          <p class="text-body" style="margin-top: 0.5rem;">${file.name} • ${data.chunks || 0} chunks</p>
        `;
        if (window.lucide) window.lucide.createIcons();

        const today = new Date();
        const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        let iconName = 'file';
        if (file.name.endsWith('.pdf')) iconName = 'file-text';
        else if (file.name.endsWith('.xlsx')) iconName = 'file-spreadsheet';
        else if (file.name.endsWith('.txt')) iconName = 'file-text';
        
        const newDocCard = document.createElement('div');
        newDocCard.className = 'doc-card';
        newDocCard.style.opacity = '0';
        newDocCard.style.transform = 'translateY(-10px)';
        newDocCard.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        
        newDocCard.innerHTML = `
          <div class="doc-card__info">
            <div class="doc-card__icon">
              <i data-lucide="${iconName}"></i>
            </div>
            <div>
              <h4 class="font-serif text-lg font-medium" style="color: var(--color-stone-900);">${file.name}</h4>
              <p class="text-body text-sm" style="margin-top: 0.25rem;">Atualizado em ${dateStr} • ${data.chunks || 0} chunks</p>
            </div>
          </div>
          <span class="doc-badge">geral</span>
        `;
        
        docList.insertBefore(newDocCard, docList.firstChild);
        if (window.lucide) window.lucide.createIcons();
        
        requestAnimationFrame(() => {
          newDocCard.style.opacity = '1';
          newDocCard.style.transform = 'translateY(0)';
        });

      } catch (err) {
        uploadArea.innerHTML = `
          <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: var(--color-terracotta); margin-bottom: 1rem;"></i>
          <h3 class="text-card-title" style="color: var(--color-terracotta);">Erro no envio</h3>
          <p class="text-body" style="margin-top: 0.5rem;">Não foi possível processar o arquivo.</p>
        `;
        if (window.lucide) window.lucide.createIcons();
      }

      setTimeout(() => {
        uploadArea.innerHTML = originalHtml;
        uploadArea.style.pointerEvents = 'auto';
        if (window.lucide) window.lucide.createIcons();
      }, 3000);
    }
  }

  // Initial draw
  setTimeout(() => {
    drawActiveChart();
  }, 100);

  window.addEventListener('resize', () => {
    drawActiveChart();
  });
});
