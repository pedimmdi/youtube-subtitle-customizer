document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const autoPersian =
            document.getElementById(
                "auto-persian"
            );


        const customSubtitles =
            document.getElementById(
                "custom-subtitles"
            );


        const statusText =
            document.getElementById(
                "status-text"
            );


        const statusDot =
            document.getElementById(
                "status-dot"
            );


        const openSettings =
            document.getElementById(
                "open-settings"
            );


        const refreshSubtitles =
            document.getElementById(
                "refresh-subtitles"
            );


        const settings =
            await chrome.storage.local.get([
                "autoPersian",
                "customSubtitles",
            ]);


        autoPersian.checked =
            settings.autoPersian !== false;


        customSubtitles.checked =
            settings.customSubtitles !== false;


        autoPersian.addEventListener(
            "change",
            async () => {

                await chrome.storage.local.set({
                    autoPersian:
                        autoPersian.checked,
                });


                if (
                    autoPersian.checked
                ) {

                    await sendMessage({
                        type:
                            "ENABLE_AUTO_PERSIAN",
                    });

                }
            }
        );


        customSubtitles.addEventListener(
            "change",
            async () => {

                await chrome.storage.local.set({
                    customSubtitles:
                        customSubtitles.checked,
                });


                await sendMessage({
                    type:
                        "CUSTOM_SUBTITLES_CHANGED",

                    enabled:
                        customSubtitles.checked,
                });
            }
        );


        openSettings.addEventListener(
            "click",
            async () => {

                await sendMessage({
                    type:
                        "OPEN_SETTINGS",
                });

                window.close();
            }
        );


        refreshSubtitles.addEventListener(
            "click",
            async () => {

                await sendMessage({
                    type:
                        "ENABLE_AUTO_PERSIAN",
                });

                window.close();
            }
        );


        try {

            const response =
                await sendMessage({
                    type:
                        "GET_STATUS",
                });


            if (
                response &&
                response.youtube
            ) {

                statusText.textContent =
                    "YouTube detected";

                statusDot.classList.add(
                    "active"
                );

            } else {

                statusText.textContent =
                    "Open a YouTube video";

                statusDot.classList.add(
                    "inactive"
                );
            }

        } catch (error) {

            statusText.textContent =
                "Open a YouTube video";

            statusDot.classList.add(
                "inactive"
            );
        }
    }
);


function sendMessage(message) {

    return new Promise(
        (resolve) => {

            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true,
                },
                (tabs) => {

                    if (
                        !tabs ||
                        !tabs.length
                    ) {
                        resolve(null);
                        return;
                    }


                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        message,
                        (response) => {

                            if (
                                chrome.runtime.lastError
                            ) {
                                resolve(null);
                                return;
                            }


                            resolve(
                                response
                            );
                        }
                    );
                }
            );
        }
    );
}