dojo.provide('harkTheSound');
dojo.require('dojo.parser');
dojo.require('widgets.namingGameEngine');
dojo.require('widgets.categoryGameEngine');
dojo.require('widgets.reactionGameEngine');
dojo.require('dojo.hash');

dojo.declare('harkTheSound', null, {
    constructor: function() {
        var loadingDialog = dijit.byId("loadingDialog"); 
        loadingDialog.show();
        loadingDialog._alreadyInitialized=false;    //user can not close now 
        this.currentlyHashing = false;
        this._keyHasGoneUp = true;
        this._waitingForResponse = false; 
        this.gameInProgress = false;
        this.optionsData = null;
        //handle hash now??
        var hashValue = dojo.hash();
        dojo.ready(dojo.hitch(this, function(){ //make sure table builds first
            this._handleHash(hashValue);
        }));
        dojo.subscribe("/dojo/hashchange", this, "_handleHash");
        
        //var optionsFormDlg = dijit.byId("formDialog");
        //set up to return JSON of options on submit
        /*optionsFormDlg.execute = dojo.hitch(this, function() {
            this.optionsData = dojo.toJson(arguments[0], true);
            //deserialize incoming data
            var dataObj = dojox.json.ref.fromJson(this.optionsData);
            var volume = dataObj.volumeSlider/dijit.byId("volumeSlider").maximum;
            this.audio.setProperty({name: 'volume', value : volume, immediate: true});
            dojo.publish("audioVolume", [volume]); //let all audio instances and channels know 
            this._optionsUpdate();
        });*/
        var audioDef = uow.getAudio({defaultCaching: true});    //get JSonic
        audioDef.addCallback(dojo.hitch(this, function(audio) { 
            this.audio = audio;
            //dojo.connect(dijit.byId("optionsButton"), "onClick", optionsFormDlg, "show"); //volume change possible
        }));
        var rewardImageRequest = {
            url : "images/rewards/imageIndex.json",
            handleAs : 'json',
            preventCache: true,
            error: function(error) {console.log(error);}
        };
        var imageDataDef = dojo.xhrGet(rewardImageRequest);
        imageDataDef.addCallback(dojo.hitch(this, function(imageData) {
            this.rewardImages = imageData.Images;
        }));
        var rewardSoundRequest = {
            url : "Sounds/rewards/soundIndex.json",
            handleAs : 'json',
            preventCache: true,
            error: function(error) {console.log(error);}
        };
        var soundDataDef = dojo.xhrGet(rewardSoundRequest);
        soundDataDef.addCallback(dojo.hitch(this, function(soundData) {
            this.rewardSounds = soundData.Sounds;
            loadingDialog._alreadyInitialized = true;   //putting here does not assure anything!!!
            loadingDialog.hide();
        }));
    },
    
    //decides what to do with a hash    
    _handleHash: function(hash) {
        if (this.isValidHash(hash)) {
            //this.audio.stop();
            this.currentlyHashing = true;
            if (this.gameInProgress) {
                this.currentGameWidget.endGame();
                this.ascend();
                this.loadGame(hash);
            }
            else {
                this.loadGame(hash);
            }
        }
    },

    // function to validate hashes, only handles a few cases 
    isValidHash: function(hash) {
        if (hash == "") {
            if (this.gameInProgress) {
                this.currentGameWidget.endGame();
            }
            return false;
        }
        else { 
            return true;
        }
    },
    
    // sends new options to whomever is listening
    //  right now it is a sending a serialized object, should just send actual object
    _optionsUpdate: function () { 
        dojo.publish("optionsUpdate", [this.optionsData]);
    },

    //  for moving up from a game selection to game choices or from game choices to game types.
    //  no longer used directly by the user.    
    ascend: function() {
        if(this.gameIndex != null) {
            this.audio.stop();
            this._waitingForResponse = false;
            this.gameIndex = null;
            this.things = this.gameCatalog.Things;
            if (!this.currentlyHashing) { //don't call if hashing
                this.currentDescription = this.things[this.gameTypeIndex].Description;
                this.updateDescription();
            }
        }
        else {
            //do nothing?? say youre at the top??
        }
    },
    
    //  hash validity covered earlier. Loads game based on hash
    loadGame: function(hash) {
        var split = hash.split("-");
        var type = split[0];
        var nameU = split[1];
        var characters = nameU.split("");
        //remove underscores
        dojo.forEach(characters, function( character, index) {
            if (character == "_") {
                characters[index] = " ";
            }
        });
        var nameS = "";
        dojo.forEach(characters, function(character){
            nameS += character;
        });
        this.initializeWidgetGame([type, nameS]);
    },     
    
    //  initialize game. gameData is a array of length 2. gameData[0] is type gameData[1] is game name.
    //  the type/name issue will be made cleaner with newer architecture
    initializeWidgetGame: function(gameData) {
        //this.audio.stop();
        //hook up channel for exit
        var gameHandle = dojo.subscribe("gameExit", dojo.hitch(this, function(message){
            if (message == "widgetDestroyed") {
                this.gameInProgress = false;
                this._waitingForResponse = true;
                if (!this.currentlyHashing) { //don't call if hashing
                    this.audio.say({text: this.currentDescription});
                }
                dojo.unsubscribe(gameHandle);
            }
        }));    
        var collectionName = gameData[0] + "Games"; //gameData[0] is the type
        var def = uow.getDatabase({
          database: 'harkGames', 
          collection : collectionName, 
          mode: 'r'
        });
        def.then(dojo.hitch(this, function(db) {
            var name = gameData[1];
            var fetch = db.fetch({ 
                query: {"Name": name}, 
                onComplete: dojo.hitch(this, function(results) {
                    this.finishWidgetBuild(results[0], gameData[0]); //gameData[0] is the type
                }) 
            });
        }));   
    }, 
    
    /*
        moved out to control when called
    */
    finishWidgetBuild: function(data, type) {
        switch(type){
        case "Naming":
        case "Math":
        case "Braille":
            this.currentGameWidget = new widgets.namingGameEngine({gameData: data, hark: this}, 'gameGoesHere');
            break;
        case "Category":
            this.currentGameWidget = new widgets.categoryGameEngine({gameData: data, hark: this}, 'gameGoesHere');
            break;
        case "Reaction":
            this.currentGameWidget = new widgets.reactionGameEngine({gameData: data, hark: this}, 'gameGoesHere');
            break;
        }
        this._waitingForResponse = false;
        this.gameInProgress = true;
    }, 
    
    //  !NOTE!
    //  all "key" functions below used by the game engine widgets. Here as a halfway point to being put on uow???
    //  !NOTE!

    _keyIsLeftArrow: function(keyStroke) {    //boolean is key pressed left arrow
        if (keyStroke.keyCode == dojo.keys.LEFT_ARROW) {
            return true;
        }
        else {
            return false;
        }
    },

    _keyIsRightArrow: function(keyStroke) {    //boolean is key pressed right arrow
        if (keyStroke.keyCode == dojo.keys.RIGHT_ARROW){
            return true;
        }
        else {
            return false;
        }
    },
    
    _keyIsUpArrow: function(keyStroke) {    //boolean is key pressed left arrow
        if (keyStroke.keyCode == dojo.keys.UP_ARROW) {
            return true;
        }
        else {
            return false;
        }
    },
    
    _keyIsDownArrow: function(keyStroke) {    //boolean is key pressed left arrow
        if (keyStroke.keyCode == dojo.keys.DOWN_ARROW) {
            return true;
        }
        else {
            return false;
        }
    },
    
    _keyIsEscape: function(keyStroke) {
        if (keyStroke.keyCode == dojo.keys.ESCAPE) {
            return true;
        }
        else {
            return false;
        }
    },
    
    //  !NOTE!
    //  both "position" functions below were used for resizing game images in the old architecture
    //  !NOTE!
    
    //  recursively (through parent-child architecture) calculate left position
    getElementLeftPosition: function (e){
        var x=0;
        while(e){
            x+=e.offsetLeft;
            e=e.offsetParent;
        }
        return x;
    },
    
    //  recursively (through parent-child architecture) calculate top position
    getElementTopPosition: function (e){
        var y=0;
        while(e){
            y+=e.offsetTop;
            e=e.offsetParent;
        }
        return y;
    },

    //  programmatically creates, shows, and return a dijit.dialog 
    _showDialog: function(theTitle, text) {
        var d = new dijit.Dialog({
            title: theTitle,
            //need a div to keep title bar outside of scrolled region
            content: "<div style=\"width: 500px; height: 100px; overflow: auto; padding-left: 25px; padding-right: 25px; text-align: left;\">" + text + "</div>",       
        });
        d.show();
        return d;
    },

    
    // Used in game engines. @return boolean if userSwitch == key event. Mouse click not covered here???
    // placed here for eventual moving to uow???
    
    _isSwitch: function(userSwitch, event){
        var keyCode = null;
        switch (userSwitch) 
        {
        case "LA":
            keyCode = dojo.keys.LEFT_ARROW;
            break;
        case "RA":
            keyCode = dojo.keys.RIGHT_ARROW;
            break;
        case "UP":
            keyCode = dojo.keys.UP_ARROW;
            break;
        case "DA":
            keyCode = dojo.keys.DOWN_ARROW;
            break;
        case "S":
            keyCode = dojo.keys.SPACE;
            break;
        case "EN":
            keyCode = dojo.keys.ENTER;
            break;
        }
        if (keyCode == event.keyCode) {
            return true;
        }
        else {
            return false;
        }
    }
});

dojo.ready(function() {
    var app = new harkTheSound();        
});
