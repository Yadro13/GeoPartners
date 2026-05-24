let map;
let geojsonLayer;
// Загружаем нашу "базу данных" из внутренней памяти браузера (LocalStorage)
let currentGeoJsonData = JSON.parse(localStorage.getItem('myGeoDb')) || {
    "type": "FeatureCollection",
    "features": []
};

// Динамические категории участков (сохраняются в LocalStorage)
let plotCategories = JSON.parse(localStorage.getItem('myGeoCategories')) || {
    'planned_wtg': { name: 'Планируемые под ВЭУ', color: '#f59e0b' },
    'wtg': { name: 'ВЭУ', color: '#10b981' },
    'alt_candidates': { name: 'Альтернативные кандидаты', color: '#8b5cf6' },
    'roads': { name: 'Дороги', color: '#64748b' },
    'default': { name: 'Не задана (Голубой)', color: '#0ea5e9' }
};

// Инициализация карты Leaflet 
map = L.map('map').setView([50.45, 30.52], 5); // Стартовый вид (масштаб отдален, чтобы видеть страну/мир)

// Создаем несколько вариантов подложек
const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Google Hybrid', maxZoom: 20
});
const googleStreets = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    attribution: 'Google Streets', maxZoom: 20
});
const openStreetMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 19
});

// По умолчанию включаем гибридную (спутник + названия стран/городов)
googleHybrid.addTo(map);

// Добавляем переключатель карт в правый верхний угол
L.control.layers({
    "Google Спутник": googleHybrid,
    "Google Схема": googleStreets,
    "OpenStreetMap": openStreetMap
}).addTo(map);

// Добавляем инструмент измерения расстояний и площади (линейку)
if (typeof L.Control.Measure !== 'undefined') {
    new L.Control.Measure({
        position: 'topleft',
        primaryLengthUnit: 'meters',
        secondaryLengthUnit: 'kilometers',
        primaryAreaUnit: 'sqmeters',
        activeColor: '#ef4444',
        completedColor: '#3b82f6'
    }).addTo(map);
}

// Принудительно обновляем размер карты при запуске (чтобы избежать бага с "пустым экраном")
setTimeout(() => { 
    map.invalidateSize(); 
    redrawMap(true); // Загружаем все сохраненные участки при старте!
}, 500);

// Привязываем генерацию отчета к кнопке
document.getElementById('generateReportBtn').addEventListener('click', generateReport);

// Универсальная функция для перерисовки карты на основе currentGeoJsonData
function redrawMap(fitBounds = false) {
    if (geojsonLayer) {
        geojsonLayer.clearLayers();
        map.removeLayer(geojsonLayer);
    }
    
    updatePlotsList(); // Обновляем список участков до того, как скрипт может прерваться
    document.getElementById('reportContainer').style.display = 'none'; // Скрываем старый отчет

    if (!currentGeoJsonData || currentGeoJsonData.features.length === 0) return;

    // Железобетонная фильтрация: убираем скрытые участки ДО передачи в карту
    const filteredFeatures = currentGeoJsonData.features.filter(feature => {
        const category = feature.properties.category || 'default';
        const catInfo = plotCategories[category] || plotCategories['default'];
        return catInfo && catInfo.visible !== false;
    });

    if (filteredFeatures.length === 0) return;

    geojsonLayer = L.geoJSON({ type: "FeatureCollection", features: filteredFeatures }, {
        style: function(feature) {
            const category = feature.properties.category || 'default';
            const catInfo = plotCategories[category] || plotCategories['default'];
            const color = catInfo.color;
            return { fillColor: color, fillOpacity: 0.2, color: color, weight: 2, fill: true };
        },
        onEachFeature: function(feature, layer) {
            const props = feature.properties || {};
            
            // Приоритетно берем кадастровый номер, который мы вытащили из PDF
            let cadastralNum = props.cadastral_number || props.sourceFilename || '';
            if (cadastralNum.length === 19 && /^\d+$/.test(cadastralNum)) {
                cadastralNum = `${cadastralNum.slice(0,10)}:${cadastralNum.slice(10,12)}:${cadastralNum.slice(12,15)}:${cadastralNum.slice(15)}`;
            }
            
            const pdfLinkHtml = props.sourceFilename
                ? `<div style="margin: 10px 0;"><a href="plots/${props.sourceFilename}.pdf" target="_blank" style="display: inline-block; background: #f1f5f9; padding: 6px 10px; border-radius: 4px; color: #0066ff; text-decoration: none; font-weight: bold; font-size: 13px; border: 1px solid #cbd5e1;">📄 Открыть PDF для заполнения</a></div>`
                : `<div style="color: #94a3b8; font-size: 12px; margin: 10px 0;">(Исходный PDF не найден)</div>`;

            // Динамически генерируем опции для селекта категорий
            let optionsHtml = '';
            for (let key in plotCategories) {
                const selected = props.category === key ? 'selected' : '';
                optionsHtml += `<option value="${key}" ${selected}>${plotCategories[key].name}</option>`;
            }

            // Поддержка старых данных (перевод из м2 в га на лету)
            let areaVal = props.area_ha !== undefined ? props.area_ha : (props.area_sqm ? props.area_sqm / 10000 : 0);
            
            // Функция для экранирования кавычек в HTML
            const escapeHtml = (str) => String(str || '').replace(/"/g, '&quot;');

            // Поля статуса и мощности показываем только для категорий ВЭУ
            const isWtgCategory = ['wtg', 'planned_wtg'].includes(props.category);
            const wtgFieldsHtml = isWtgCategory ? `
                <div style="margin-bottom: 5px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Проектная мощность (МВт):</label>
                    <input type="number" step="0.1" value="${props.project_capacity || ''}" onchange="updatePlotData('${props.id}', 'project_capacity', this.value)" style="width: 100%; box-sizing: border-box; padding: 4px;">
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Статус:</label>
                    <input type="text" value="${escapeHtml(props.status)}" onchange="updatePlotData('${props.id}', 'status', this.value)" style="width: 100%; box-sizing: border-box; padding: 4px;">
                </div>
            ` : '';

            // Поле основного кандидата показываем только для "Альтернативных кандидатов"
            const isAltCategory = props.category === 'alt_candidates';
            const altFieldsHtml = isAltCategory ? `
                <div style="margin-bottom: 8px;">
                    <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Кад. номер осн. кандидата:</label>
                    <input type="text" value="${escapeHtml(props.main_candidate_cadastral)}" onchange="updatePlotData('${props.id}', 'main_candidate_cadastral', this.value)" placeholder="Например: 1234567890:12:345:6789" style="width: 100%; box-sizing: border-box; padding: 4px;">
                </div>
            ` : '';

            layer.bindPopup(`
                <div style="color: black; min-width: 220px;">
                    <h3 style="margin: 0 0 5px 0;">Участок: ${cadastralNum || 'Без названия'}</h3>
                    ${pdfLinkHtml}
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Название:</label>
                        <input type="text" value="${escapeHtml(props.name)}" onchange="updatePlotData('${props.id}', 'name', this.value)" style="width: 100%; box-sizing: border-box; padding: 4px;">
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Категория:</label>
                        <select onchange="updatePlotData('${props.id}', 'category', this.value)" style="width: 100%; padding: 4px;">
                            ${optionsHtml}
                        </select>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Площадь (га):</label>
                        <input type="number" step="0.0001" value="${areaVal}" onchange="updatePlotData('${props.id}', 'area_ha', this.value)" style="width: 100%; box-sizing: border-box; padding: 4px;">
                    </div>
                    ${wtgFieldsHtml}
                    ${altFieldsHtml}
                    <div style="margin-bottom: 5px;">
                        <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Владелец:</label>
                        <input type="text" value="${escapeHtml(props.owner)}" onchange="updatePlotData('${props.id}', 'owner', this.value)" style="width: 100%; box-sizing: border-box; padding: 4px;">
                    </div>
                    <div style="margin-bottom: 5px;">
                        <label style="font-size: 12px; display: block; margin-bottom: 2px; font-weight: bold;">Арендатор:</label>
                        <input type="text" value="${escapeHtml(props.lessee)}" onchange="updatePlotData('${props.id}', 'lessee', this.value)" style="width: 100%; box-sizing: border-box; padding: 4px;">
                    </div>
                    <button onclick="map.closePopup()" style="width: 100%; margin-top: 15px; background: #10b981; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">💾 Сохранить и закрыть</button>
                    <button onclick="removePlot('${props.id}')" style="width: 100%; margin-top: 8px; background: #ef4444; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">🗑 Удалить участок</button>
                </div>
            `);

            // Эффект при наведении (подсветка участка)
            let currentLatLng = null;
            layer.on({
                mouseover: function(e) {
                    const targetLayer = e.target;
                    targetLayer.setStyle({
                        fillOpacity: 0.6
                    });
                    currentLatLng = e.latlng;
                    
                    // --- УМНАЯ ПОДСВЕТКА АЛЬТЕРНАТИВНЫХ КАНДИДАТОВ ---
                    const normMainCad = (cadastralNum || '').replace(/[^\d]/g, '');
                    if (props.category === 'planned_wtg' && normMainCad) {
                        geojsonLayer.eachLayer(function(l) {
                            const otherProps = l.feature.properties || {};
                            const normAltCad = (otherProps.main_candidate_cadastral || '').replace(/[^\d]/g, '');
                            if (otherProps.category === 'alt_candidates' && normAltCad === normMainCad) {
                                l.setStyle({ fillOpacity: 0.8, weight: 3, color: '#f59e0b' }); // Ярко подсвечиваем оранжевым контуром
                                l._isAltHighlighted = true; // Ставим метку, чтобы потом погасить
                            }
                        });
                    }

                    // Запускаем таймер на 0.6 секунды
                    targetLayer.hoverTimer = setTimeout(() => {
                        if (targetLayer.isPopupOpen()) return; // Не показываем подсказку, если уже открыто окно
                        
                        targetLayer.bindTooltip(
                            `<div style="font-size: 12px; text-align: center;">
                                <span style="color: #64748b;">Кадастровый номер:</span><br>
                                <strong>${cadastralNum || 'Неизвестно'}</strong>
                            </div>`,
                            { direction: 'top', opacity: 0.9, offset: [0, -10] }
                        ).openTooltip(currentLatLng);
                    }, 600);
                },
                mousemove: function(e) {
                    currentLatLng = e.latlng; // Обновляем позицию мышки, пока она движется
                },
                mouseout: function(e) {
                    const targetLayer = e.target;
                    geojsonLayer.resetStyle(targetLayer);
                    
                    // Сбрасываем подсветку связанных "Альтернативных кандидатов"
                    if (props.category === 'planned_wtg') {
                        geojsonLayer.eachLayer(function(l) {
                            if (l._isAltHighlighted) {
                                geojsonLayer.resetStyle(l);
                                l._isAltHighlighted = false;
                            }
                        });
                    }

                    // Отменяем таймер (если мышка ушла быстрее 1 сек) и удаляем подсказку
                    clearTimeout(targetLayer.hoverTimer);
                    if (targetLayer.getTooltip()) {
                        targetLayer.closeTooltip();
                        targetLayer.unbindTooltip();
                    }
                },
                click: function(e) {
                    const targetLayer = e.target;
                    // При клике сразу гасим подсказку, чтобы она не конфликтовала с окном
                    clearTimeout(targetLayer.hoverTimer);
                    if (targetLayer.getTooltip()) {
                        targetLayer.closeTooltip();
                        targetLayer.unbindTooltip();
                    }
                }
            });
        }
    }).addTo(map);
    
    // Центрируем карту с небольшой задержкой и ограничением максимального зума
    if (fitBounds) {
        try {
            const bounds = geojsonLayer.getBounds();
            if (bounds.isValid()) {
                setTimeout(() => {
                    // flyToBounds делает красивый перелет. maxZoom защищает от зависания на микро-участках
                    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 17, duration: 1.5 });
                }, 100);
            }
        } catch (e) {
            console.error("Ошибка при центрировании:", e);
        }
    }
}

// Глобальная функция для обновления данных из всплывающего окна на карте
window.updatePlotData = function(id, key, value) {
    const feature = currentGeoJsonData.features.find(f => f.properties && f.properties.id === id);
    if (feature) {
        if (key === 'area_ha' || key === 'area_sqm' || key === 'project_capacity') value = value ? parseFloat(value) : 0;
        feature.properties[key] = value;
        
        // Сохраняем изменения в локальную память
        localStorage.setItem('myGeoDb', JSON.stringify(currentGeoJsonData));
        
        // Обновляем список участков в боковой панели (если изменили название/номер)
        updatePlotsList();
        
        // Если изменилась категория - перерисовываем карту, чтобы обновить цвет и поля участка
        if (key === 'category') {
            redrawMap(false);
            // Восстанавливаем открытое окно участка после перерисовки
            if (geojsonLayer) {
                geojsonLayer.eachLayer(function(layer) {
                    if (layer.feature.properties.id === id) layer.openPopup();
                });
            }
        }
    }
};

// Обновляем список участков в сайдбаре
window.updatePlotsList = function() {
    const listContainer = document.getElementById('plotsList');
    if (!listContainer) return;
    
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    if (!currentGeoJsonData || currentGeoJsonData.features.length === 0) {
        listContainer.innerHTML = 'Нет участков';
        return;
    }
    
    let html = '';
    let count = 0;
    currentGeoJsonData.features.forEach((f, index) => {
        const props = f.properties || {};
        
        const category = props.category || 'default';
        const catInfo = plotCategories[category] || plotCategories['default'];
        if (catInfo && catInfo.visible === false) return; // Скрываем из списка
        
        let cadastralNum = props.cadastral_number || props.sourceFilename || '';
        if (cadastralNum.length === 19 && /^\d+$/.test(cadastralNum)) {
            cadastralNum = `${cadastralNum.slice(0,10)}:${cadastralNum.slice(10,12)}:${cadastralNum.slice(12,15)}:${cadastralNum.slice(15)}`;
        }
        
        const name = props.name || cadastralNum || ('Участок ' + (index + 1));
        const owner = props.owner || '';
        
        // Фильтрация по поиску (ищет совпадения в имени, номере или владельце)
        if (query && !name.toLowerCase().includes(query) && !cadastralNum.toLowerCase().includes(query) && !owner.toLowerCase().includes(query)) {
            return;
        }
        
        count++;
        html += `<div style="padding: 5px 0; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 5px;">
                    <span onclick="flyToPlot('${props.id}')" style="cursor: pointer; color: #0066ff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1;" title="${String(name).replace(/"/g, '&quot;')} - Кликните для перехода">${String(name).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                    <button onclick="removePlot('${props.id}')" style="background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; padding: 2px 6px; font-size: 11px; margin-left: 5px;">✕</button>
                 </div>`;
    });
    listContainer.innerHTML = html || '<div style="color: #94a3b8;">Ничего не найдено</div>';
};

// Перелет к участку при клике в списке
window.flyToPlot = function(id) {
    if (!geojsonLayer) return;
    geojsonLayer.eachLayer(function(layer) {
        if (layer.feature.properties.id === id) {
            map.flyToBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 17, duration: 1 });
            layer.openPopup(); // Автоматически открываем окошко участка
        }
    });
};

// Удаление участка по ID
window.removePlot = function(id) {
    currentGeoJsonData.features = currentGeoJsonData.features.filter(f => f.properties.id !== id);
    localStorage.setItem('myGeoDb', JSON.stringify(currentGeoJsonData));
    redrawMap(false);
};

// 1. Загрузка сводной базы (data.json)
function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.type === "FeatureCollection") {
                // Проверяем, чтобы у всех старых участков был внутренний ID для работы мини-формы
                data.features.forEach(f => {
                    if (!f.properties) f.properties = {};
                    if (!f.properties.id) f.properties.id = "plot_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
                });

                currentGeoJsonData = data;
                localStorage.setItem('myGeoDb', JSON.stringify(currentGeoJsonData));

                // Восстанавливаем настройки категорий из файла
                if (data.categories) {
                    plotCategories = data.categories;
                    localStorage.setItem('myGeoCategories', JSON.stringify(plotCategories));
                    renderCategoriesSidebar();
                }

                redrawMap(true);
            } else {
                alert('Ошибка: файл базы данных должен содержать FeatureCollection.');
            }
        } catch (error) {
            alert('Ошибка при чтении базы данных.');
        }
        event.target.value = ''; // Сбрасываем инпут
    };
    reader.readAsText(file);
}

// 2. Автоматическое добавление участков и фоновое подтягивание PDF
async function addPlots(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const geoFiles = files.filter(f => f.name.match(/\.(json|geojson)$/i));
    if (geoFiles.length === 0) return;

    document.getElementById('plotsList').innerHTML = '<div style="color: #f59e0b; padding: 5px;">⏳ Загрузка и анализ данных...</div>';
    let featuresAdded = 0;

    for (const file of geoFiles) {
        const filenameNoExt = file.name.replace(/\.[^/.]+$/, "");
        let pdfMeta = {};

        // 1. Пытаемся автоматически найти и прочитать PDF в папке plots/
        try {
            const pdfResponse = await fetch(`plots/${filenameNoExt}.pdf`);
            if (pdfResponse.ok) {
                const arrayBuffer = await pdfResponse.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(" ") + " ";
                }
                
                let area = 0; let owner = ""; let cadastral = "";
                
                // Ищем кадастровый номер прямо в тексте PDF (19 цифр с любыми разделителями)
                const cadMatch = fullText.match(/\b(\d{10}[:\s-]?\d{2}[:\s-]?\d{3}[:\s-]?\d{4})\b/);
                if (cadMatch) {
                    let cleanCad = cadMatch[1].replace(/[^\d]/g, ''); // очищаем от мусора
                    if (cleanCad.length === 19) {
                        cadastral = `${cleanCad.slice(0,10)}:${cleanCad.slice(10,12)}:${cleanCad.slice(12,15)}:${cleanCad.slice(15)}`;
                    }
                }
                
                // Умный поиск площади (жесткая привязка к "Площа земельної ділянки", учитываем отсутствие единиц)
                const areaMatch = fullText.match(/(?:площа земельної ділянки|площа|площадь)[^\d]{0,100}?([\d\.,]+(?: \d+)*)\s*(га|гектар|кв\.?\s*м|м2|м²)?/i);
                if (areaMatch) {
                    let numStr = areaMatch[1].replace(/\s/g, '').replace(',', '.');
                    area = parseFloat(numStr);
                    let unit = areaMatch[2] ? areaMatch[2].toLowerCase() : '';
                    
                    // Если указаны кв.м. или число слишком большое (например, 15000 без единиц), переводим в ГА
                    if (unit.includes('кв') || unit.includes('м2') || unit.includes('м²') || (!unit && area >= 1000 && !fullText.toLowerCase().includes('(га)'))) {
                        area /= 10000;
                    }
                    area = Number(area.toFixed(4)); // Округляем до 4 знаков (например, 1.5000)
                }
                
                let owners = [];
                // 1) Ищем блок информации о владельцах до начала блока "Відомості про суб'єкта речового права" или до конца файла
                const ownershipBlockMatch = fullText.match(/Відомості[\s]*про[\s]*суб['’]?єктів[\s]*права[\s]*власності[\s]*на[\s]*земельну[\s]*ділянку([\s\S]*?)(?:Відомості[\s]*про[\s]*суб['’]?(?:єкта|єктів)[\s]*речового[\s]*права[\s]*на[\s]*земельну[\s]*ділянку|$)/i);
                
                if (ownershipBlockMatch) {
                    const blockText = ownershipBlockMatch[1];
                    
                    // 2) Ищем ФИО физических лиц между "Прізвище, ім'я та по батькові..." и "Дата державної реєстрації права"
                    const personRegex = /Прізвище[\s,]*ім['’]?я[\s]*та[\s]*по[\s]*батькові[\s]*фізичної[\s]*особи[\s:;-]*([\s\S]*?)Дата[\s]*державної[\s]*реєстрації[\s]*права/gi;
                    let match;
                    
                    // 3) Повторяем поиск внутри найденного блока
                    while ((match = personRegex.exec(blockText)) !== null) {
                        let foundName = match[1].trim();
                        foundName = foundName.replace(/\s+/g, ' '); // Убираем лишние переносы строк и двойные пробелы
                        
                        if (foundName && !owners.includes(foundName)) {
                            owners.push(foundName);
                        }
                    }
                    
                    // Поиск юридических лиц в блоке владельцев
                    const legalRegex = /Найменування[\s]*юридичної[\s]*особи[\s:;-]*([\s\S]*?)(?:Код[\s]*ЄДРПОУ|Ідентифікаційний[\s]*код)[\s]*юридичної[\s]*особи/gi;
                    while ((match = legalRegex.exec(blockText)) !== null) {
                        let foundName = match[1].trim();
                        foundName = foundName.replace(/\s+/g, ' ');
                        
                        if (foundName && !owners.includes(foundName)) {
                            owners.push(foundName);
                        }
                    }
                }
                
                // 4) Если список пустой, оставляем параметр пустым
                owner = owners.length > 0 ? owners.join(", ") : "";
                
                // --- ПАРСИНГ АРЕНДАТОРА ---
                let lessee = "";
                // Ищем блок аренды (речового права) до конца файла
                const lesseeBlockMatch = fullText.match(/Відомості[\s]*про[\s]*суб['’]?(?:єкта|єктів)[\s]*речового[\s]*права[\s]*на[\s]*земельну[\s]*ділянку([\s\S]*)/i);
                
                if (lesseeBlockMatch) {
                    const lesseeBlockText = lesseeBlockMatch[1];
                    
                    // Поиск юридического лица
                    const legalLesseeMatch = lesseeBlockText.match(/Найменування[\s]*юридичної[\s]*особи[\s:;-]*([\s\S]*?)(?:Код[\s]*ЄДРПОУ|Ідентифікаційний[\s]*код)[\s]*юридичної[\s]*особи/i);
                    // Поиск физического лица
                    const physicalLesseeMatch = lesseeBlockText.match(/Прізвище[\s,]*ім['’]?я[\s]*та[\s]*по[\s]*батькові[\s]*фізичної[\s]*особи[\s:;-]*([\s\S]*?)Дата[\s]*державної[\s]*реєстрації[\s]*права/i);
                    
                    if (legalLesseeMatch) {
                        lessee = legalLesseeMatch[1].replace(/\s+/g, ' ').trim();
                    } else if (physicalLesseeMatch) {
                        lessee = physicalLesseeMatch[1].replace(/\s+/g, ' ').trim();
                    }
                }
                
                pdfMeta = { area_ha: area, owner: owner, cadastral: cadastral, lessee: lessee };
            }
        } catch (e) {
            console.warn(`PDF для ${filenameNoExt} не найден или недоступен для автозагрузки.`);
        }

        // 2. Читаем координаты и применяем данные из PDF
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            let features = [];
            if (data.type === "FeatureCollection" && Array.isArray(data.features)) features = data.features;
            else if (data.type === "Feature") features = [data];
            else features = [data]; 
            
            features.forEach(feat => {
                let coords = null; let geomType = "Polygon";
                if (feat.geometry && feat.geometry.coordinates) { coords = feat.geometry.coordinates; geomType = feat.geometry.type; } 
                else if (feat.coordinates) { coords = feat.coordinates; geomType = feat.type || "Polygon"; } 
                else if (Array.isArray(feat)) { coords = feat; }

                if (coords) {
                    if (geomType === 'LineString' || (Array.isArray(coords[0]) && typeof coords[0][0] === 'number')) {
                        coords = [coords]; geomType = "Polygon";
                    }
                        
                    let firstCoord = coords; while (Array.isArray(firstCoord)) firstCoord = firstCoord[0];
                    if (typeof firstCoord === 'number' && Math.abs(firstCoord) > 180) {
                        alert(`Ошибка: координаты участка ${file.name} не в формате WGS84.`);
                        return; 
                    }
                    
                    let props = feat.properties || {};
                    const perfectFeature = {
                        "type": "Feature",
                        "geometry": { "type": geomType, "coordinates": coords },
                        "properties": {
                            "sourceFilename": props.sourceFilename || filenameNoExt,
                            "id": props.id || "plot_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
                            "name": props.name || "",
                            "category": props.category || "default",
                            "cadastral_number": pdfMeta.cadastral || props.cadastral_number || "",
                            "area_ha": pdfMeta.area_ha !== undefined ? pdfMeta.area_ha : (props.area_ha !== undefined ? props.area_ha : (props.area_sqm ? props.area_sqm / 10000 : 0)),
                            "project_capacity": props.project_capacity || 0,
                            "status": props.status || "",
                            "main_candidate_cadastral": props.main_candidate_cadastral || "",
                            "owner": pdfMeta.owner || props.owner || "",
                            "lessee": pdfMeta.lessee || props.lessee || ""
                        }
                    };
                    currentGeoJsonData.features.push(perfectFeature);
                    featuresAdded++;
                }
            });
        } catch (error) {
            console.error(`Ошибка чтения участка: ${file.name}`, error);
        }
    }

    if (featuresAdded > 0) {
        redrawMap(true); 
        localStorage.setItem('myGeoDb', JSON.stringify(currentGeoJsonData));
    } else {
        updatePlotsList(); 
    }
    
    event.target.value = '';
}

// 3. Экспорт собранной базы в data.json
function exportDatabase() {
    if (currentGeoJsonData.features.length === 0) {
        return alert("База пуста! Сначала добавьте участки.");
    }
    
    // Собираем всё в один файл (и участки, и настройки категорий)
    const exportData = {
        type: "FeatureCollection",
        categories: plotCategories,
        features: currentGeoJsonData.features
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Функция формирования сводного отчета
function generateReport() {
    if (currentGeoJsonData.features.length === 0) return alert("Сначала добавьте участки!");

    let totalArea = 0;
    let count = 0;
    const categoryCount = {};

    // Проходимся по всем загруженным участкам
    currentGeoJsonData.features.forEach(function(feature) {
        const cat = feature.properties.category || 'default';
        const catInfo = plotCategories[cat] || plotCategories['default'];
        if (catInfo.visible === false) return; // Игнорируем скрытые слои в отчете

        count++;
        let area = feature.properties.area_ha !== undefined ? feature.properties.area_ha : (feature.properties.area_sqm ? feature.properties.area_sqm / 10000 : 0);
        totalArea += area;
        
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    // Формируем HTML отчета
    const reportContainer = document.getElementById('reportContainer');
    let html = `<h3>Сводный отчет</h3>`;
    html += `<div class="report-item"><strong>Всего участков:</strong> ${count} шт.</div>`;
    html += `<div class="report-item"><strong>Общая площадь:</strong> ${totalArea.toLocaleString('ru-RU', {maximumFractionDigits: 4})} га</div>`;
    
    html += `<h4>По категориями:</h4>`;
    for (const [cat, qty] of Object.entries(categoryCount)) {
        const catInfo = plotCategories[cat] || plotCategories['default'];
        html += `<div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="display: inline-block; width: 12px; height: 12px; background: ${catInfo.color}; opacity: 0.7; margin-right: 8px; border-radius: 2px;"></span>
                    ${catInfo.name}: ${qty} шт.
                 </div>`;
    }

    reportContainer.innerHTML = html;
    reportContainer.style.display = 'block'; // Показываем блок
}

// --- Логика управления категориями ---
window.toggleAccordion = function(id) {
    const el = document.getElementById(id);
    const btn = el.previousElementSibling;
    if (el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerHTML = btn.innerHTML.replace('▾', '▴');
    } else {
        el.style.display = 'none';
        btn.innerHTML = btn.innerHTML.replace('▴', '▾');
    }
};

window.renderCategoriesSidebar = function() {
    const list = document.getElementById('categoriesSettingsList');
    if (!list) return;
    let html = '';
    for (let key in plotCategories) {
        const cat = plotCategories[key];
        const isDefault = key === 'default';
        const isVisible = cat.visible !== false;
        const delBtn = isDefault ? '<span style="width:20px;"></span>' : `<button onclick="deleteCategory('${key}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px;" title="Удалить">✕</button>`;
        
        html += `
            <div style="display: flex; align-items: center; margin-bottom: 8px; font-size: 13px;">
                <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="toggleCategoryVisibility('${key}', this.checked)" style="cursor: pointer; margin-right: 8px;" title="Отображать на карте">
                <input type="color" value="${cat.color}" onchange="updateCategoryColor('${key}', this.value)" style="width: 25px; height: 25px; padding: 0; border: none; border-radius: 4px; cursor: pointer; flex-shrink: 0;">
                <input type="text" value="${cat.name}" onchange="updateCategoryName('${key}', this.value)" ${isDefault ? 'disabled' : ''} style="flex-grow: 1; margin: 0 8px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; box-sizing: border-box; width: 100px;">
                ${delBtn}
            </div>
        `;
    }
    list.innerHTML = html;
};

window.saveCategories = function() {
    localStorage.setItem('myGeoCategories', JSON.stringify(plotCategories));
    redrawMap(false);
};

window.updateCategoryColor = function(key, color) {
    if (plotCategories[key]) plotCategories[key].color = color;
    saveCategories();
};

window.updateCategoryName = function(key, name) {
    if (plotCategories[key]) plotCategories[key].name = name;
    saveCategories();
};

window.toggleCategoryVisibility = function(key, isVisible) {
    if (plotCategories[key]) {
        plotCategories[key].visible = isVisible;
        saveCategories(); // Это автоматически вызовет redrawMap и обновит списки
    }
};

window.addNewCategory = function() {
    const key = 'cat_' + Date.now();
    plotCategories[key] = { name: 'Новая категория', color: '#3b82f6' };
    saveCategories();
    renderCategoriesSidebar();
};

window.deleteCategory = function(key) {
    if (confirm('Вы уверены, что хотите удалить эту категорию? Участки с ней будут сброшены на "Не задана".')) {
        delete plotCategories[key];
        
        // Сбрасываем категорию у существующих участков
        currentGeoJsonData.features.forEach(f => {
            if (f.properties && f.properties.category === key) {
                f.properties.category = 'default';
            }
        });
        localStorage.setItem('myGeoDb', JSON.stringify(currentGeoJsonData));
        
        saveCategories();
        renderCategoriesSidebar();
    }
};

// Инициализируем отрисовку сайдбара категорий при старте
renderCategoriesSidebar();