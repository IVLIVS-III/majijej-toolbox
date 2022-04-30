let rawMessage, message, alertDuration, alertImage, alertVideo, alertSound, alertVolume, debugMode;

function displayPatreonAlert({ firstName = "Anonymous" }) {
    // set message
    unsanitizedMessage = rawMessage.replace("<FIRSTNAME>", firstName);
    SE_API.sanitize({ message: unsanitizedMessage }).then(sanityResult => {
        /*
            sanityResult={
                "result":{
                    "message":"Hello Kreygasm" //Message after validation
                },
                "skip":false // Should it be skipped according to rules 
            }
        */
        if (sanityResult["skip"]) {
            return;
        }

        message = sanityResult["result"]["message"];
        document.getElementById("alertMessage").innerText = message;
        // display alert
        showPatreonAlert();

        document.getElementById("alertImage").style.visibility = alertImage ? "unset" : "hidden";
        document.getElementById("alertVideo").style.visibility = alertVideo ? "unset" : "hidden";

        // play sound
        let soundAlert;
        if (alertSound) {
            soundAlert = new Audio(alertSound);
            soundAlert.volume = parseInt(alertVolume) / 100;
            soundAlert.play();
        }

        setTimeout(() => {
            if (soundAlert) {
                soundAlert.pause();
            }
            hidePatreonAlert();
        }, alertDuration * 1000);
    });
}

function showPatreonAlert() {
    document.getElementById("container").style.visibility = "visible";
}

function hidePatreonAlert() {
    if (debugMode) {
        return;
    }

    document.getElementById("container").style.visibility = "hidden";
}

window.addEventListener('onWidgetLoad', function (obj) {
    fieldData = obj.detail.fieldData;
    rawMessage = fieldData['message'];
    alertDuration = fieldData['alertDuration'];
    alertImage = fieldData['alertImage'];
    alertVideo = fieldData['alertVideo'];
    alertSound = fieldData['alertSound'];
    alertVolume = fieldData['alertVolume'];
    debugMode = fieldData['debugMode'];

    if (debugMode) {
        showPatreonAlert();
    } else {
        hidePatreonAlert();
    }
});

window.addEventListener('onEventReceived', function (obj) {
    // fancy stuff here
    // we only care about kvstore updates
    if (!debugMode) {
        if (obj.detail.listener !== "kvstore:update") {
            SE_API.resumeQueue();
            return;
        }

        // we only care about changes to the key 'patreon_sub'
        if (obj.detail.event.data.key !== "customWidget.patreon.sub") {
            SE_API.resumeQueue();
            return;
        }
    }

    // we got a new patreon, display the alert
    displayPatreonAlert({
        firstName: debugMode ? undefined : obj.detail.event.data.value.firstName,
    });
    setTimeout(SE_API.resumeQueue, (alertDuration + 1) * 1000);
});
