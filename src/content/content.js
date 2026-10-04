(() => {
    "use strict";

    const YSC = {
        name: "[YSC]",

        defaults: {
            fontFamily: "Tahoma, Arial, sans-serif",

            fontSize: 26,
            fontWeight: 600,
            lineHeight: 1.6,

            textColor: "#ffffff",
            backgroundColor: "#000000",
            backgroundOpacity: 0.72,

            borderRadius: 8,

            paddingVertical: 8,
            paddingHorizontal: 18,

            maxWidth: 78,
            bottom: 9,

            textShadow: true,

            maxLines: 2,
            maxCharsPerLine: 42,
        },

        settings: {},

        lastSubtitle: "",

        observer: null,
        interval: null,

        renderer: null,
        rendererText: null,

        settingsButton: null,
        settingsPanel: null,
    };


    // ==================================================
    // SETTINGS
    // ==================================================

    async function loadSettings() {
        try {
            const stored = await chrome.storage.local.get(
                "yscSettings"
            );

            YSC.settings = {
                ...YSC.defaults,
                ...(stored.yscSettings || {}),
            };
        } catch (error) {
            console.error(
                `${YSC.name} Failed to load settings`,
                error
            );

            YSC.settings = {
                ...YSC.defaults,
            };
        }
    }


    async function saveSettings() {
        try {
            await chrome.storage.local.set({
                yscSettings: YSC.settings,
            });
        } catch (error) {
            console.error(
                `${YSC.name} Failed to save settings`,
                error
            );
        }
    }


    async function resetSettings() {
        YSC.settings = {
            ...YSC.defaults,
        };

        await saveSettings();

        applySettings();

        updateSettingsPanel();

        updateSubtitle();
    }


    // ==================================================
    // VISIBILITY
    // ==================================================

    function isVisible(element) {

        if (!element) {
            return false;
        }

        const rect =
            element.getBoundingClientRect();

        return (
            rect.width > 0 &&
            rect.height > 0
        );
    }


    // ==================================================
    // CURRENT YOUTUBE CAPTION
    // ==================================================

    function getCurrentCaptionLines() {

        const container =
            document.querySelector(
                ".ytp-caption-window-container"
            );

        if (!container) {
            return [];
        }


        const segments = [
            ...container.querySelectorAll(
                ".ytp-caption-segment"
            ),
        ];


        if (!segments.length) {
            return [];
        }


        const visibleSegments =
            segments.filter(
                (segment) => {

                    const rect =
                        segment.getBoundingClientRect();

                    return (
                        rect.width > 0 &&
                        rect.height > 0
                    );
                }
            );


        if (!visibleSegments.length) {
            return [];
        }


        const groups = [];


        for (
            const segment
            of visibleSegments
        ) {

            const rect =
                segment.getBoundingClientRect();


            const top =
                Math.round(
                    rect.top / 5
                ) * 5;


            let group =
                groups.find(
                    (item) =>
                        Math.abs(
                            item.top - top
                        ) <= 5
                );


            if (!group) {

                group = {
                    top,
                    segments: [],
                };

                groups.push(group);
            }


            group.segments.push({

                left: rect.left,

                text:
                    (
                        segment.innerText ||
                        segment.textContent ||
                        ""
                    )
                        .replace(/\s+/g, " ")
                        .trim(),
            });
        }


        groups.sort(
            (a, b) =>
                a.top - b.top
        );


        const lines =
            groups
                .map(
                    (group) => {

                        group.segments.sort(
                            (a, b) =>
                                a.left - b.left
                        );


                        return group.segments
                            .map(
                                (item) =>
                                    item.text
                            )
                            .filter(Boolean)
                            .join(" ")
                            .replace(/\s+/g, " ")
                            .trim();
                    }
                )
                .filter(Boolean);


        return lines.slice(
            -Math.max(
                1,
                Number(
                    YSC.settings.maxLines
                ) || 2
            )
        );
    }


    function getSubtitleText() {
        const lines =
            getCurrentCaptionLines();


        if (!lines.length) {
            return "";
        }


        return lines.join("\n");
    }


    // ==================================================
    // TEXT
    // ==================================================

    function containsPersianOrArabic(text) {
        return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(
            text
        );
    }


    function normalizeSubtitleText(text) {
        return text
            .replace(/\r/g, "")
            .replace(/[ \t]+/g, " ")
            .replace(
                /\s+([،؛؟.!?,:;])/g,
                "$1"
            )
            .trim();
    }


    function splitIntoWords(text) {
        return text
            .trim()
            .split(/\s+/)
            .filter(Boolean);
    }


    function getLineLength(line) {
        return line
            .replace(/\s+/g, " ")
            .trim()
            .length;
    }


    // ==================================================
    // SMART LINE BREAKING
    // ==================================================

    function buildLines(
        words,
        maxChars,
        maxLines
    ) {
        if (!words.length) {
            return [];
        }


        const lines = [];

        let currentLine = "";


        for (const word of words) {

            const candidate =
                currentLine
                    ? `${currentLine} ${word}`
                    : word;


            if (
                currentLine &&
                candidate.length > maxChars
            ) {

                lines.push(
                    currentLine
                );

                currentLine = word;

                if (
                    lines.length >=
                    maxLines - 1
                ) {
                    break;
                }

                continue;
            }


            currentLine =
                candidate;
        }


        if (currentLine) {
            lines.push(
                currentLine
            );
        }


        const usedWords =
            lines
                .join(" ")
                .split(/\s+/)
                .filter(Boolean);


        if (
            usedWords.length <
            words.length
        ) {

            const remaining =
                words.slice(
                    usedWords.length
                );


            if (lines.length) {
                lines[
                    lines.length - 1
                ] +=
                    ` ${remaining.join(" ")}`;
            }
        }


        return lines;
    }


    function balanceTwoLines(lines) {
        if (lines.length !== 2) {
            return lines;
        }


        const allWords = [
            ...splitIntoWords(lines[0]),
            ...splitIntoWords(lines[1]),
        ];


        if (allWords.length < 4) {
            return lines;
        }


        let bestSplit = 1;

        let bestDifference =
            Infinity;


        for (
            let split = 1;
            split < allWords.length;
            split++
        ) {

            const first =
                allWords
                    .slice(0, split)
                    .join(" ");


            const second =
                allWords
                    .slice(split)
                    .join(" ");


            const difference =
                Math.abs(
                    getLineLength(first) -
                    getLineLength(second)
                );


            if (
                difference <
                bestDifference
            ) {

                bestDifference =
                    difference;

                bestSplit =
                    split;
            }
        }


        return [
            allWords
                .slice(0, bestSplit)
                .join(" "),

            allWords
                .slice(bestSplit)
                .join(" "),
        ];
    }


    function formatSubtitle(text) {
        const normalized =
            normalizeSubtitleText(text);


        if (!normalized) {
            return "";
        }


        const maxChars =
            Number(
                YSC.settings.maxCharsPerLine
            ) || 42;


        const maxLines =
            Number(
                YSC.settings.maxLines
            ) || 2;


        /*
         * If YouTube already gave us
         * visual lines, use them as source.
         */

        const originalLines =
            normalized
                .split("\n")
                .map(
                    (line) =>
                        line.trim()
                )
                .filter(Boolean);


        const words =
            splitIntoWords(
                originalLines.join(" ")
            );


        let lines =
            buildLines(
                words,
                maxChars,
                maxLines
            );


        if (maxLines === 2) {
            lines =
                balanceTwoLines(lines);
        }


        return lines.join("\n");
    }


    // ==================================================
    // RENDERER
    // ==================================================

    function createRenderer() {
        if (YSC.renderer) {
            return true;
        }


        const player =
            document.querySelector(
                ".html5-video-player"
            );


        if (!player) {
            return false;
        }


        const renderer =
            document.createElement("div");


        renderer.id =
            "ysc-subtitle-container";


        const text =
            document.createElement("div");


        text.id =
            "ysc-subtitle-text";


        renderer.appendChild(text);

        player.appendChild(renderer);


        YSC.renderer =
            renderer;

        YSC.rendererText =
            text;


        applySettings();


        return true;
    }


    // ==================================================
    // APPLY SETTINGS
    // ==================================================

    function applySettings() {
        if (
            !YSC.renderer ||
            !YSC.rendererText
        ) {
            return;
        }


        const s =
            YSC.settings;


        YSC.renderer.style.setProperty(
            "--ysc-font-family",
            s.fontFamily
        );


        YSC.renderer.style.setProperty(
            "--ysc-font-size",
            `${s.fontSize}px`
        );


        YSC.renderer.style.setProperty(
            "--ysc-font-weight",
            s.fontWeight
        );


        YSC.renderer.style.setProperty(
            "--ysc-line-height",
            s.lineHeight
        );


        YSC.renderer.style.setProperty(
            "--ysc-text-color",
            s.textColor
        );


        YSC.renderer.style.setProperty(
            "--ysc-background-color",
            s.backgroundColor
        );


        YSC.renderer.style.setProperty(
            "--ysc-background-opacity",
            s.backgroundOpacity
        );


        YSC.renderer.style.setProperty(
            "--ysc-border-radius",
            `${s.borderRadius}px`
        );


        YSC.renderer.style.setProperty(
            "--ysc-padding-vertical",
            `${s.paddingVertical}px`
        );


        YSC.renderer.style.setProperty(
            "--ysc-padding-horizontal",
            `${s.paddingHorizontal}px`
        );


        YSC.renderer.style.setProperty(
            "--ysc-max-width",
            `${s.maxWidth}%`
        );


        YSC.renderer.style.setProperty(
            "--ysc-bottom",
            `${s.bottom}%`
        );


        YSC.rendererText.classList.toggle(
            "ysc-no-shadow",
            !s.textShadow
        );


        YSC.rendererText.classList.toggle(
            "ysc-rtl",
            containsPersianOrArabic(
                YSC.lastSubtitle
            )
        );
    }


    // ==================================================
    // UPDATE SUBTITLE
    // ==================================================

    function updateSubtitle() {
        if (
            !YSC.rendererText ||
            !YSC.lastSubtitle
        ) {
            return;
        }


        YSC.rendererText.textContent =
            formatSubtitle(
                YSC.lastSubtitle
            );


        applySettings();
    }


    function showSubtitle(text) {
        if (!createRenderer()) {
            return;
        }


        YSC.rendererText.textContent =
            formatSubtitle(text);


        YSC.renderer.classList.add(
            "ysc-visible"
        );


        applySettings();
    }


    function hideSubtitle() {
        if (!YSC.renderer) {
            return;
        }


        YSC.renderer.classList.remove(
            "ysc-visible"
        );
    }


    // ==================================================
    // SETTINGS BUTTON
    // ==================================================

    function createSettingsButton() {
        if (YSC.settingsButton) {
            return true;
        }


        const player =
            document.querySelector(
                ".html5-video-player"
            );


        if (!player) {
            return false;
        }


        const button =
            document.createElement("button");


        button.id =
            "ysc-settings-button";


        button.type =
            "button";


        button.setAttribute(
            "aria-label",
            "Subtitle Settings"
        );


        button.innerHTML =
            "⚙";


        button.addEventListener(
            "click",
            (event) => {

                event.preventDefault();

                event.stopPropagation();

                toggleSettingsPanel();
            }
        );


        player.appendChild(button);


        YSC.settingsButton =
            button;


        return true;
    }


    // ==================================================
    // SETTINGS PANEL
    // ==================================================

    function createSettingsPanel() {
        if (YSC.settingsPanel) {
            return true;
        }


        const player =
            document.querySelector(
                ".html5-video-player"
            );


        if (!player) {
            return false;
        }


        const panel =
            document.createElement("div");


        panel.id =
            "ysc-settings-panel";


        panel.innerHTML = `
            <div class="ysc-panel-header">
                <span>Subtitle Settings</span>

                <button
                    type="button"
                    id="ysc-close-settings"
                >
                    ×
                </button>
            </div>

            <div class="ysc-panel-content">

                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Font Size
                        <span id="ysc-font-size-value"></span>
                    </div>

                    <input
                        id="ysc-font-size"
                        type="range"
                        min="14"
                        max="56"
                        step="1"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Font Weight
                        <span id="ysc-font-weight-value"></span>
                    </div>

                    <input
                        id="ysc-font-weight"
                        type="range"
                        min="300"
                        max="900"
                        step="100"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Line Height
                        <span id="ysc-line-height-value"></span>
                    </div>

                    <input
                        id="ysc-line-height"
                        type="range"
                        min="1"
                        max="2.5"
                        step="0.1"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Background Opacity
                        <span id="ysc-opacity-value"></span>
                    </div>

                    <input
                        id="ysc-opacity"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Border Radius
                        <span id="ysc-radius-value"></span>
                    </div>

                    <input
                        id="ysc-radius"
                        type="range"
                        min="0"
                        max="30"
                        step="1"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Subtitle Width
                        <span id="ysc-width-value"></span>
                    </div>

                    <input
                        id="ysc-width"
                        type="range"
                        min="30"
                        max="95"
                        step="1"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Bottom Position
                        <span id="ysc-bottom-value"></span>
                    </div>

                    <input
                        id="ysc-bottom"
                        type="range"
                        min="2"
                        max="30"
                        step="1"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Characters Per Line
                        <span id="ysc-chars-value"></span>
                    </div>

                    <input
                        id="ysc-chars"
                        type="range"
                        min="20"
                        max="70"
                        step="1"
                    >
                </div>


                <div class="ysc-setting">
                    <div class="ysc-setting-label">
                        Maximum Lines
                        <span id="ysc-lines-value"></span>
                    </div>

                    <input
                        id="ysc-lines"
                        type="range"
                        min="1"
                        max="2"
                        step="1"
                    >
                </div>


                <div class="ysc-colors">

                    <label>
                        <span>Text</span>

                        <input
                            id="ysc-text-color"
                            type="color"
                        >
                    </label>


                    <label>
                        <span>Background</span>

                        <input
                            id="ysc-background-color"
                            type="color"
                        >
                    </label>

                </div>


                <label class="ysc-switch-row">

                    <span>
                        Text Shadow
                    </span>

                    <input
                        id="ysc-shadow"
                        type="checkbox"
                    >

                </label>


                <button
                    type="button"
                    id="ysc-reset"
                    class="ysc-reset-button"
                >
                    Reset Settings
                </button>

            </div>
        `;


        player.appendChild(panel);


        YSC.settingsPanel =
            panel;


        bindSettingsEvents();

        updateSettingsPanel();


        return true;
    }


    // ==================================================
    // SETTINGS EVENTS
    // ==================================================

    function bindSettingsEvents() {
        const panel =
            YSC.settingsPanel;


        if (!panel) {
            return;
        }


        const bindRange =
            (id, key) => {

                const input =
                    panel.querySelector(
                        `#${id}`
                    );


                if (!input) {
                    return;
                }


                input.addEventListener(
                    "input",
                    async () => {

                        YSC.settings[key] =
                            Number(
                                input.value
                            );


                        applySettings();

                        updateSubtitle();

                        updateSettingsPanel();

                        await saveSettings();
                    }
                );
            };


        bindRange(
            "ysc-font-size",
            "fontSize"
        );


        bindRange(
            "ysc-font-weight",
            "fontWeight"
        );


        bindRange(
            "ysc-line-height",
            "lineHeight"
        );


        bindRange(
            "ysc-opacity",
            "backgroundOpacity"
        );


        bindRange(
            "ysc-radius",
            "borderRadius"
        );


        bindRange(
            "ysc-width",
            "maxWidth"
        );


        bindRange(
            "ysc-bottom",
            "bottom"
        );


        bindRange(
            "ysc-chars",
            "maxCharsPerLine"
        );


        bindRange(
            "ysc-lines",
            "maxLines"
        );


        const textColor =
            panel.querySelector(
                "#ysc-text-color"
            );


        textColor.addEventListener(
            "input",
            async () => {

                YSC.settings.textColor =
                    textColor.value;

                applySettings();

                await saveSettings();
            }
        );


        const backgroundColor =
            panel.querySelector(
                "#ysc-background-color"
            );


        backgroundColor.addEventListener(
            "input",
            async () => {

                YSC.settings.backgroundColor =
                    backgroundColor.value;

                applySettings();

                await saveSettings();
            }
        );


        const shadow =
            panel.querySelector(
                "#ysc-shadow"
            );


        shadow.addEventListener(
            "change",
            async () => {

                YSC.settings.textShadow =
                    shadow.checked;

                applySettings();

                await saveSettings();
            }
        );


        const closeButton =
            panel.querySelector(
                "#ysc-close-settings"
            );


        closeButton.addEventListener(
            "click",
            () => {
                closeSettingsPanel();
            }
        );


        const resetButton =
            panel.querySelector(
                "#ysc-reset"
            );


        resetButton.addEventListener(
            "click",
            async () => {
                await resetSettings();
            }
        );
    }


    // ==================================================
    // UPDATE SETTINGS PANEL
    // ==================================================

    function updateSettingsPanel() {
        const panel =
            YSC.settingsPanel;


        if (!panel) {
            return;
        }


        const s =
            YSC.settings;


        const setValue =
            (id, value, label) => {

                const input =
                    panel.querySelector(
                        `#${id}`
                    );


                const output =
                    panel.querySelector(
                        `#${id}-value`
                    );


                if (input) {
                    input.value =
                        value;
                }


                if (output) {
                    output.textContent =
                        label;
                }
            };


        setValue(
            "ysc-font-size",
            s.fontSize,
            `${s.fontSize}px`
        );


        setValue(
            "ysc-font-weight",
            s.fontWeight,
            s.fontWeight
        );


        setValue(
            "ysc-line-height",
            s.lineHeight,
            s.lineHeight
        );


        setValue(
            "ysc-opacity",
            s.backgroundOpacity,
            `${Math.round(
                s.backgroundOpacity * 100
            )}%`
        );


        setValue(
            "ysc-radius",
            s.borderRadius,
            `${s.borderRadius}px`
        );


        setValue(
            "ysc-width",
            s.maxWidth,
            `${s.maxWidth}%`
        );


        setValue(
            "ysc-bottom",
            s.bottom,
            `${s.bottom}%`
        );


        setValue(
            "ysc-chars",
            s.maxCharsPerLine,
            `${s.maxCharsPerLine}`
        );


        setValue(
            "ysc-lines",
            s.maxLines,
            `${s.maxLines}`
        );


        const textColor =
            panel.querySelector(
                "#ysc-text-color"
            );


        if (textColor) {
            textColor.value =
                s.textColor;
        }


        const backgroundColor =
            panel.querySelector(
                "#ysc-background-color"
            );


        if (backgroundColor) {
            backgroundColor.value =
                s.backgroundColor;
        }


        const shadow =
            panel.querySelector(
                "#ysc-shadow"
            );


        if (shadow) {
            shadow.checked =
                s.textShadow;
        }
    }


    // ==================================================
    // PANEL
    // ==================================================

    function openSettingsPanel() {
        if (!createSettingsPanel()) {
            return;
        }


        YSC.settingsPanel.classList.add(
            "ysc-panel-visible"
        );
    }


    function closeSettingsPanel() {
        if (!YSC.settingsPanel) {
            return;
        }


        YSC.settingsPanel.classList.remove(
            "ysc-panel-visible"
        );
    }


    function toggleSettingsPanel() {
        if (!createSettingsPanel()) {
            return;
        }


        const visible =
            YSC.settingsPanel.classList.contains(
                "ysc-panel-visible"
            );


        if (visible) {
            closeSettingsPanel();
        } else {
            openSettingsPanel();
        }
    }


    // ==================================================
    // SUBTITLE PROCESSING
    // ==================================================

    function checkSubtitle() {
        const text =
            getSubtitleText();


        if (!text) {

            if (
                YSC.lastSubtitle !== ""
            ) {

                YSC.lastSubtitle =
                    "";

                hideSubtitle();
            }

            return;
        }


        const normalized =
            normalizeSubtitleText(text);


        if (!normalized) {
            return;
        }


        if (
            normalized ===
            normalizeSubtitleText(
                YSC.lastSubtitle
            )
        ) {
            return;
        }


        YSC.lastSubtitle =
            text;


        showSubtitle(text);
    }


    // ==================================================
    // OBSERVER
    // ==================================================

    function startObserver() {
        if (YSC.observer) {
            return;
        }


        YSC.observer =
            new MutationObserver(
                () => {
                    checkSubtitle();
                }
            );


        YSC.observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                characterData: true,
            }
        );
    }


    // ==================================================
    // POLLING
    // ==================================================

    function startPolling() {
        if (YSC.interval) {
            return;
        }


        YSC.interval =
            setInterval(
                () => {
                    checkSubtitle();
                },
                100
            );
    }


    // ==================================================
    // PLAYER
    // ==================================================

    function initializePlayer() {
        const player =
            document.querySelector(
                ".html5-video-player"
            );


        if (!player) {
            return false;
        }


        createRenderer();

        createSettingsButton();

        createSettingsPanel();


        return true;
    }


    // ==================================================
    // YOUTUBE AUTO PERSIAN
    // ==================================================

    function findElementByText(
        root,
        texts
    ) {
        const elements =
            root.querySelectorAll(
                "button, yt-button-renderer, tp-yt-paper-item, ytd-menu-service-item-renderer"
            );


        for (const element of elements) {

            const text =
                (
                    element.innerText ||
                    element.textContent ||
                    ""
                )
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();


            for (const target of texts) {

                if (
                    text.includes(
                        target.toLowerCase()
                    )
                ) {
                    return element;
                }
            }
        }


        return null;
    }


    function clickElement(element) {
        if (!element) {
            return false;
        }


        element.click();

        return true;
    }


    function getCaptionButton() {

        return (
            document.querySelector(
                ".ytp-subtitles-button"
            ) ||
            document.querySelector(
                'button[aria-label*="subtitle" i]'
            ) ||
            document.querySelector(
                'button[aria-label*="caption" i]'
            )
        );
    }


    function isCaptionEnabled() {

        const button =
            getCaptionButton();


        if (!button) {
            return false;
        }


        return (
            button.getAttribute(
                "aria-pressed"
            ) === "true" ||
            button.classList.contains(
                "ytp-button-active"
            )
        );
    }


    function enableCaptions() {

        const button =
            getCaptionButton();


        if (!button) {
            return false;
        }


        if (
            !isCaptionEnabled()
        ) {

            clickElement(button);

            return true;
        }


        return false;
    }


    function openCaptionSettings() {

        const button =
            getCaptionButton();


        if (!button) {
            return false;
        }


        /*
        * YouTube normally exposes
        * the subtitle menu through
        * the settings button.
        */

        const settingsButton =
            document.querySelector(
                ".ytp-settings-button"
            );


        if (!settingsButton) {
            return false;
        }


        settingsButton.click();

        return true;
    }


    function clickSubtitlesMenu() {

        const menu =
            findElementByText(
                document,
                [
                    "Subtitles/CC",
                    "Subtitles",
                    "Captions",
                ]
            );


        if (!menu) {
            return false;
        }


        menu.click();

        return true;
    }


    function clickAutoTranslate() {

        const autoTranslate =
            findElementByText(
                document,
                [
                    "Auto-translate",
                    "Auto translate",
                ]
            );


        if (!autoTranslate) {
            return false;
        }


        autoTranslate.click();

        return true;
    }


    function clickPersian() {

        const persian =
            findElementByText(
                document,
                [
                    "Persian",
                    "Farsi",
                    "فارسی",
                ]
            );


        if (!persian) {
            return false;
        }


        persian.click();

        return true;
    }


    async function enableYouTubePersianSubtitles() {

        if (
            !location.hostname.includes(
                "youtube.com"
            )
        ) {
            return;
        }


        /*
        * Wait for YouTube player.
        */

        for (
            let i = 0;
            i < 30;
            i++
        ) {

            if (
                document.querySelector(
                    ".html5-video-player"
                )
            ) {
                break;
            }


            await sleep(500);
        }


        /*
        * Enable CC.
        */

        enableCaptions();


        /*
        * Give YouTube time to
        * initialize caption menu.
        */

        await sleep(700);


        /*
        * Open settings.
        */

        const opened =
            openCaptionSettings();


        if (!opened) {
            return;
        }


        await sleep(400);


        /*
        * Open Subtitles / CC.
        */

        const openedSubtitles =
            clickSubtitlesMenu();


        if (!openedSubtitles) {
            return;
        }


        await sleep(400);


        /*
        * Auto Translate.
        */

        const autoTranslated =
            clickAutoTranslate();


        if (!autoTranslated) {
            return;
        }


        await sleep(400);


        /*
        * Persian.
        */

        clickPersian();
    }


    function sleep(ms) {

        return new Promise(
            (resolve) =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }


    // ==================================================
    // MESSAGE HANDLER
    // ==================================================

    chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => {

            if (!message) {
                return;
            }


            if (
                message.type ===
                "GET_STATUS"
            ) {

                sendResponse({
                    youtube:
                        location.hostname.includes(
                            "youtube.com"
                        ),
                });

                return true;
            }


            if (
                message.type ===
                "OPEN_SETTINGS"
            ) {

                openSettingsPanel();

                sendResponse({
                    success: true,
                });

                return true;
            }


            if (
                message.type ===
                "CUSTOM_SUBTITLES_CHANGED"
            ) {

                if (
                    YSC.renderer
                ) {

                    if (
                        message.enabled
                    ) {

                        YSC.renderer.style.display =
                            "flex";

                    } else {

                        YSC.renderer.style.display =
                            "none";
                    }
                }


                sendResponse({
                    success: true,
                });

                return true;
            }


            if (
                message.type ===
                "ENABLE_AUTO_PERSIAN"
            ) {

                enableYouTubePersianSubtitles();

                sendResponse({
                    success: true,
                });

                return true;
            }
        }
    );


    // ==================================================
    // INIT
    // ==================================================

    async function init() {

        console.log(
            `${YSC.name} Starting...`
        );


        await loadSettings();

        const storedSettings =
            await chrome.storage.local.get(
                "autoPersian"
            );


        if (
            storedSettings.autoPersian !== false
        ) {

            setTimeout(
                () => {
                    enableYouTubePersianSubtitles();
                },
                1800
            );
        }

        const ready =
            initializePlayer();


        if (!ready) {

            const waitForPlayer =
                setInterval(
                    () => {

                        if (
                            initializePlayer()
                        ) {

                            clearInterval(
                                waitForPlayer
                            );
                        }

                    },
                    500
                );
        }


        startObserver();

        startPolling();

        checkSubtitle();


        console.log(
            `${YSC.name} Ready.`
        );
    }


    init();

})();