dojo.provide("widgets.namingGameEngine");
dojo.require("dijit.Dialog");
dojo.require("dijit._Templated");
dojo.require("dijit._Widget");
dojo.require("dojox.timing");
dojo.require("dojo.cache");
dojo.require("dijit._base.manager");

dojo.declare('widgets.namingGameEngine', [dijit._Widget, dijit._Templated], {

    templateString: dojo.cache("HarkTheSound/widgets", "templates/namingGameEngineTemplate.html"),

    widgetsInTemplate: true,

    hark: {}, 
    
    gameData: {}, 

    constructor: function() {
        this._loadingDialog = this._showDialog("Loading Screen", "The game is loading.");   //move to index
        this._loadingDialog._alreadyInitialized=false;    //user can not close now 
        this._waitingForResponse = false;    //waiting for user input
        this._keyHasGoneUp = true;
        this.gameStarted = false;
        this.currentPrompt = "";
        this._hasMoved = false;
        this._choicesRemaining =  [];
        //listen for options updates
        dojo.subscribe("optionsUpdate", dojo.hitch(this, function(data) {
            this._updateOptions(data);
        }));
        var def = uow.getAudio({defaultCaching: true});    //get JSonic
        def.addCallback(dojo.hitch(this, function(audio) { 
            this._audio = audio;
            this.audioSub = dojo.subscribe("audioVolume", dojo.hitch(this, function(newVolume){
                this._audio.setProperty({name : 'volume', value: newVolume, immediate : true});
                this._audio.setProperty({name : 'volume', value: newVolume, channel : 'second', immediate : true});
            }));
            var constructorHandle = dojo.subscribe("namingGameEngineStartup", dojo.hitch(this, function(message){
                if (message == "postCreate_ready" && !this.gameStarted) {
                    this._loadingDialog._alreadyInitialized = true;
                    this._loadingDialog.hide();
                    this.gameStarted = true;
                    dojo.unsubscribe(constructorHandle);
                    this._startGame();
                }
            }));
            dojo.publish("namingGameEngineStartup", ["constructor_ready"]);
        }));
    },
    
    postCreate: function() {
        this.choiceNode = dojo.byId("choiceBox");
        if (!this.hark.optionsData) { //then must get options from game JSON
            this._presetOptions();
        }
        else{   //user has specified option preferences
            this._updateOptions(this.hark.optionsData);        
        }      
        this.inherited(arguments);
        this.rewardImages = this.hark.rewardImages;
        this._thingsToName = this.gameData.Things;
        this.gameImage = dojo.byId("gameImage");
        //this was stuck in to overcome the "broken image" image in chrome. probably a better way
        this._changeGameImage({ 
            "url": "images/white.jpg", 
            "width": 1, 
            "height": 1
        });
        this._betweenRoundPhrases = this.gameData.Between_Rounds;
        this._currentChoices = [];
        this._currentChoiceIndex = 0;
        this.promptNode = dojo.byId("promptBox");
        this.randomThings = dojo.map(this._thingsToName, function(item) {return item;}); //shallow copy
        this._randomize(this.randomThings); //so now it is actually "random"
        this._randomize(this.randomThings);
        this._currentThingIndex = 0; //index of this.randomThings
        this._possibleQuestions = this.gameData.Question;
        var postCreateHandle = dojo.subscribe("namingGameEngineStartup", dojo.hitch(this, function(message){
            if (message == "constructor_ready" && !this.gameStarted) {
                this._loadingDialog._alreadyInitialized = true;
                this._loadingDialog.hide();
                this.gameStarted = true;
                dojo.unsubscribe(postCreateHandle);
                this._startGame();
            }
        }));
        dojo.publish("namingGameEngineStartup", ["postCreate_ready"]);
    },

    //  called when game starts AND user has not yet changed anything in options menu
    //  could just get from HTML, but setup wont even be used on HTS.org
    _presetOptions: function() {
        this.askAboutQuit = false;
        this.moverSwitch = "None";
        this.chooserSwitch = "None";
        this.repeatRounds = false;
        this.pairAnswers = this.gameData.Pair_answers_with_prompts;
        this._choicesPerRound = this.gameData.Choices_per_round;
        this.keyRepeat = false; //I really don't think we want to implement this
        this.promptTime = 1;
        this.keyDelay = 0;
    },
    
    //  this method handles incoming new data submitted by user from options dialog
    //  no need to change all every time. Will be changed in new version.
    _updateOptions: function(newDataString) {
        //deserialize incoming data -- should be done before passing
        var newJSONObj = dojox.json.ref.fromJson(newDataString);

        if (newJSONObj.askQuit[0]) {
            this.askAboutQuit = true;
        }
        else {
            this.askAboutQuit = false;
        }
        if (newJSONObj.repeatRounds[0]){
            this.repeatRounds = true;
        }
        else{
            this.repeatRounds = false;
        }
        if (newJSONObj.pairAnswers[0]){
            this.pairAnswers = true;
        }
        else {
            this.pairAnswers = false;
        }
        this._choicesPerRound = newJSONObj.choicesPerRound;
        if (newJSONObj.keyRepeat[0]){//I really don't think we want to implement this
            this.keyRepeat = true;
        }
        else {
            this.keyRepeat = false;
        }
        this.promptTime = newJSONObj.promptTime;
        this.keyDelay = newJSONObj.keyDelay;
        this.moverSwitch = newJSONObj.moverSwitch;
        this.chooserSwitch = newJSONObj.chooserSwitch;
    },
    
    _startGame: function() {
        this.connect(dojo.global, 'onkeyup', '_removeKeyDownFlag');
        this.connect(dojo.global, 'onkeydown', '_analyzeKey');
        this.connect(dojo.global, 'onresize', 'resizeGameImage');
        this._audio.say({ text: "welcome to " + this.gameData.Name }).callAfter(dojo.hitch(this, function() {
            this._runNextQuestion();
        }));
    },
    
    _runNextQuestion: function() {
        if (this._choicesRemaining.length == 0) {
            this._buildChoices();
        }
        else {
            //pop off one to choose next
            var nextCorrect = this._choicesRemaining.pop();
            //find the new correct index. remember game is still running off of this._currentChoices
            this._correctChoiceIndex = this._findCorrectAnswerIndex(this._currentChoices, nextCorrect.Name);
        }
        this.askQuestion();
    },
    
    //  picks one of the available questions and asks or plays it    
    askQuestion: function() {
        var shallowCopy = dojo.map(this._possibleQuestions, function(item) {return item;}); 
        this._randomize(shallowCopy);
        var toAsk = shallowCopy.pop();
        var def = this.sayOrPlay(toAsk);
        def.callAfter( dojo.hitch(this, function() {
            this.playThingPrompt();
        }));
    },

    //  picks a random thing and plays its prompt
   playThingPrompt: function() {
        this._currentThing = this._currentChoices[this._correctChoiceIndex];
        var shallowCopy = dojo.map(this._currentThing.Prompt, function(item){return item;});
        this._randomize(shallowCopy);
        var toSay = shallowCopy.pop();
        var def = this.sayOrPlay(toSay);
        def.callBefore(dojo.hitch(this, function() {
            this.promptNode.innerHTML = "Prompt: "+this.currentPrompt;
            //wait for timeout to accept response
            setTimeout(dojo.hitch(this, function(){this._waitingForResponse = true;}), this.promptTime*1000);
        }));
    },
    
    //  says or plays the string that is passed in. Assumes that if url passed it, root is "Sounds"
    //  @return the deferred. updates the current prompt.
    sayOrPlay: function(string) {
        var splitArray = string.split("/");
        if ((splitArray[0] == "Sounds") && (splitArray.length > 1)) { //then play it
            this._audio.stop();
            var def = this._audio.play({url: string});
            this.currentPrompt = "";
        }
        else {  //say it
            this._audio.stop();
            var def = this._audio.say({text: string});
            this.currentPrompt = string;
        }
        return def;
    },

    //  build the random answer choices
    _buildChoices: function() {
        //build array of indices other than current
        this._currentChoiceIndex = 0;
        this._questionAttempts = 0;
        this._hasMoved = false;
        var possibleIndices = [];
        var index = 0;
        while (index < (this.randomThings.length)) {
            if (index == this._currentThingIndex) {}
            else { possibleIndices.push(index);}
            index++;
        }
        this._randomize(possibleIndices);
        //put in objects
        var index2 = 0;
        this._currentChoices = [];
        while(index2 < (this._choicesPerRound - 1)) { //no its not an off by 1 error
            this._currentChoices[index2] = this.randomThings[possibleIndices[index2]];
            index2++;
        }
        this._currentChoices[(this._choicesPerRound-1)] = this.randomThings[this._currentThingIndex];
        this._randomize(this._currentChoices);
        this._choicesRemaining = dojo.map(this._currentChoices, function(item){return item;});
        this._correctChoiceIndex = this._findCorrectAnswerIndex(this._currentChoices, this.randomThings[this._currentThingIndex].Name);
        this._choicesRemaining.splice(this._correctChoiceIndex, 1); //because indices will be the same for remaining and current
    },
    
    //  @return index of thing in array whose "Name" property == name
    _findCorrectAnswerIndex: function(array, name) {
        var toReturn;
        dojo.forEach(array, function(item, index) {
            if (item.Name == name) {
                toReturn = index;
            }
            else {} //continue looking
        });
        return toReturn;
    },
    
    //  randomizes an array
    _randomize: function(array) {
        var i = array.length;
        if ( i == 0 ) return false;
        while ( --i ) {
            var j = Math.floor( Math.random() * ( i + 1 ) );
            var tempi = array[i];
            var tempj = array[j];
            array[i] = tempj;
            array[j] = tempi;
        }
    },

    //  to do if user has chosen to pair answer with prompts on each choice selection    
    _pairSequence: function() {
        var toSay = dojo.map(this._currentChoices[this._currentChoiceIndex].Prompt, function(item){return item;});
        this._randomize(toSay);
        this.sayOrPlay(toSay.pop());
    },
    
    _decrementChoiceIndex: function() {
        this._hasMoved = true;
        if(this._currentChoiceIndex == 0) {
            this._currentChoiceIndex = this._currentChoices.length - 1; 
        }
        else {
            this._currentChoiceIndex--;
        }
    },
    
    _incrementChoiceIndex: function() {
        this._hasMoved = true;
        if(this._currentChoiceIndex == (this._currentChoices.length - 1)) {
            this._currentChoiceIndex = 0; 
        }
        else {
            this._currentChoiceIndex++;
        }
    },
    
    //  update nodes and present audio 
    _updateDescription: function() {
        //image
        var images = dojo.map(this._currentChoices[this._currentChoiceIndex].Picture, function(item) {return item;});
        if (images.length >= 1) {
            this._randomize(images);
            var imageData = images.pop();
            this._changeGameImage(imageData);
        }
        //text
        this.choiceNode.innerHTML = "Choice: " + String(this._currentChoices[this._currentChoiceIndex].Name);
        var shallowCopy = dojo.map(this._currentChoices[this._currentChoiceIndex].Answer, function(item){return item;});
        this._randomize(shallowCopy);
        var toSay = shallowCopy.pop();
        var defReturn = this.sayOrPlay(toSay);
        return defReturn;        
    },

    _incrementThingIndex: function() {
        if (this._currentThingIndex == (this.randomThings.length-1)) { 
            this._currentThingIndex = 0;
        }
        else {this._currentThingIndex ++;}
    },
    _goodChoice: function() {
        this.choiceNode.innerHTML = "Choice: ";
        this._waitingForResponse = false; 
        this.promptNode.innerHTML = "Prompt: ";
        
        //sequence for picking random reward image
        var imageData = dojo.clone(this.rewardImages);
        this._randomize(imageData);
        var image = imageData.pop();
        this._changeGameImage(image);
        
        //sequence for picking random reward sound
        var soundData = dojo.clone(this.hark.rewardSounds);
        this._randomize(soundData);
        var sound = soundData.pop();
        this._audio.stop();
        this._audio.play({url: sound.url}).callAfter(dojo.hitch(this, function() {
            dojo.addClass("gameImage", "hidden");
            this.gameImage.src = "images/white.jpg"; //because of chrome's display issues
            if (this._choicesRemaining.length == 0) { //then moving on
                this._incrementThingIndex();
            }
            this._runNextQuestion();
        }));
        
    },
    
    _badChoice: function() {
        if ((this._questionAttempts >= 2) && (this._currentChoices[this._correctChoiceIndex].Hint.length >= 1)) {// then going to give a hint
            //this prevents the too early click unless necesary
            this._waitingForResponse = false;
            var doHint = true;
        }
        else{
            var doHint = false;
        }
        this._audio.stop();
        var responses = ["Try Again", "Oops, try again", "You can do it, try again"];
        var randomResponse = responses[Math.floor(Math.random()*responses.length)];
        var def = this.sayOrPlay(randomResponse);
        def.callAfter(dojo.hitch(this, function() {
            if (doHint) {
                    var hints = dojo.map(this._currentChoices[this._correctChoiceIndex].Hint, function(item) {return item;});
                    this._randomize(hints);
                    var hint = hints.pop();
                    var def = this.sayOrPlay("Hint: " + hint);
                    def.callAfter(dojo.hitch(this, function() {
                        this._waitingForResponse = true;
                    }));
                }

        }));
    },
    
    //  used for changing game Image. resizing is done in this.resizeGameImage(). This is for getting
    //  the proper aspect ratio upon insertion of a new image src
    _changeGameImage: function(imageData) {
        this.currentImageData = imageData;
        this.findVisibleImageArea();
        console.log(dojo.byId("gameImage"));
        //get rid of current image or else you will see it size to next images' dimensions
        dojo.addClass("gameImage", "hidden");
        this.gameImage.src = "";
        
        //get image ratio
        var imageRatio = this.currentImageData.width/this.currentImageData.height;
        var windowRatio = this.availableWidth/this.availableHeight;
        if ((this.currentImageData.height == 0) || ( this.availableHeight == 0)) {
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio < 0) {
            //then window sized down really really small, div's have reorganized
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio >= imageRatio) {
            //set by height
            this.gameImage.style.height = this.availableHeight + "px";
            this.gameImage.style.width = "auto";
        }
        else {
            //set by width
            this.gameImage.style.width = this.availableWidth + "px";
            this.gameImage.style.height = "auto";
        }
        //now change image source
        dojo.removeClass("gameImage", "hidden");
        this.gameImage.src = this.currentImageData.url;
        console.log("Url: ", this.currentImageData.url);
        
    },
    
    // finds available space for game image and sets this.availableWidth and this.availableHeight    
    findVisibleImageArea: function () {
        this.availableWidth = dojo.global.innerWidth - 25;   //25 is for padding and div's
        var rewardTopPosition = this.hark.getElementTopPosition(this.gameImage);
        this.availableHeight = dojo.global.innerHeight - rewardTopPosition - 25 ; //25 is for padding
    },
    
    //  works correctly if an image is already loaded and has established style height/width
    //  for inserting new image use  this._changeGameImage()
    resizeGameImage: function () {
        this.findVisibleImageArea();
        //get image ratio 
        var imageRatio = this.currentImageData.width/this.currentImageData.height;
        var windowRatio = this.availableWidth/this.availableHeight;
        if ((this.currentImageData.height == 0) || ( this.availableHeight == 0)) {
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio < 0) {
            //then window sized down really really small, div's have reorganized
            this.gameImage.style.height = "0px";
            this.gameImage.style.width = "0px";
        }
        else if (windowRatio >= imageRatio) {
            //set by height
            this.gameImage.style.height = this.availableHeight + "px";
            this.gameImage.style.width = "auto";
        }
        else {
            //set by width
            this.gameImage.style.width = this.availableWidth + "px";
            this.gameImage.style.height = "auto";
        }
    }, 
    
    uninitialize: function() {
        dojo.unsubscribe(this.audioSub);
        var handle = dojo.subscribe("gameExit", dojo.hitch(this, function(){
            dojo.unsubscribe(handle);
        }));
        dojo.publish("gameExit", ["widgetDestroyed"]);
    },
    
    //  this was pulled out to allow hark frame to kill the game -- hashing
    endGame: function() {
        this._audio.stop();
        this._waitingForResponse = false;
        this.promptNode.innerHTML = "Prompt: ";
        this.choiceNode.innerHTML = "Choice: "
        //add node back in case another game instantiated
        //var actionNode = dojo.byId("actionPane");
        //dojo.place("<div id='gameGoesHere'></div>", actionNode );
        this.destroyRecursive();
    },
    
    _moveSequence: function(evt) {
        evt.preventDefault();
        //increment current choice index then read
        this._incrementChoiceIndex();
        var def = this._updateDescription();
        def.callAfter(dojo.hitch(this, function() {
            if(this.pairAnswers) {
                this._pairSequence();
            }
        }));
    },
    
    _chooseSequence: function(evt) {
        evt.preventDefault();
        if(!this._hasMoved) { //has not yet moved to select                        
            this._audio.stop();
            this._audio.say({text: "You must move through the choices before you can select an answer."});
        }
        else { //check if correct
            this._questionAttempts++;
            if (this._correctChoiceIndex == this._currentChoiceIndex) {//correct
                this._goodChoice();
            }
            else {//incorrect
                this._badChoice();
            }
        }
    },
    
    //  analyzes user input
    _analyzeKey: function(evt){	//checks keyStrokes
        if (this._keyHasGoneUp) {
            this._keyHasGoneUp = false;
            if (this._waitingForResponse) {
                if(this.hark._keyIsEscape(evt)) {   //destroy widget
                    this.endGame();
                }
                //never combine the apparently similar if...then statements. precedence of order matters
                else if (this.hark._isSwitch(this.moverSwitch, evt)) {
                    this._moveSequence(evt);
                }
                else if (this.hark._isSwitch(this.chooserSwitch, evt)) {
                    this._chooseSequence(evt);
                }                
                else if (this.hark._keyIsDownArrow(evt)) {
                    evt.preventDefault();
                    this._audio.stop();
                    this.playThingPrompt();
                }
                else if (this.hark._keyIsLeftArrow(evt)){ //then attempted to move
                    evt.preventDefault();
                    //increment current choice index then read
                    this._decrementChoiceIndex();
                    var def = this._updateDescription();
                    def.callAfter(dojo.hitch(this, function() {
                        if(this.pairAnswers) {
                            this._pairSequence();
                        }
                    }));
                }
                else if (this.hark._keyIsRightArrow(evt)) { //then attempted to move
                    this._moveSequence(evt);
                }
                else if (this.hark._keyIsUpArrow(evt)) { //then we want to see if correct key hit
                    this._chooseSequence(evt);
                }
            }
        
            else {
                if (this.hark._keyIsDownArrow(evt) || this.hark._keyIsLeftArrow(evt) || this.hark._keyIsRightArrow(evt) || this.hark._keyIsUpArrow(evt)) {
                    evt.preventDefault();
                }
                this._audio.stop({channel: "second"});  //else tooEarlySounds will queue up hit hit fast
                this._audio.play({url: "Sounds/TooEarlyClick", channel : "second"});
            }
        }
        else {
            if (this.hark._keyIsDownArrow(evt) || this.hark._keyIsLeftArrow(evt) || this.hark._keyIsRightArrow(evt) || this.hark._keyIsUpArrow(evt)) {
                evt.preventDefault();
            }
            this._audio.stop({channel: "second"});  //else tooEarlySounds will queue up hit hit fast
            this._audio.play({url: "Sounds/TooEarlyClick", channel : "second"});
        }
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
    
    _removeKeyDownFlag: function() {
        if (this.keyDelayTimer && this.keyDelayTimer.isRunning){} //do nothing
        else{
            this.keyDelayTimer = new dojox.timing.Timer(this.keyDelay*1000);
            this.keyDelayTimer.onTick = dojo.hitch(this, function() {
                this.keyDelayTimer.stop(); //prevent from running again.
                this._keyHasGoneUp = true;
            });
            this.keyDelayTimer.start();
        }
	},


});
