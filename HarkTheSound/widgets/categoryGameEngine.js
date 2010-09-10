dojo.require("dijit.Dialog");
dojo.require("dijit._Templated");
dojo.require("dijit._Widget");
dojo.provide("widgets.categoryGameEngine");
dojo.require("dojox.json.ref");
dojo.require("dojox.timing");

 
//set unused checkboxes etc to disabled

dojo.declare("widgets.categoryGameEngine", [dijit._Widget, dijit._Templated], {

    templateString: dojo.cache("HarkTheSound/widgets", "templates/namingGameEngineTemplate.html"),

    widgetsInTemplate: true,

    hark: {}, 
    
    gameData: {},
    
    constructor: function() {    //load screen
        this._loadingDialog = this._showDialog("Loading Screen", "The game is loading.");   
        this._loadingDialog._alreadyInitialized=false;    //user can not close now 
        this._categoriesIndex = 0;   //current category as a position of this._categories, assigned later.
        this._questionAttempts = 0;
        this.correctThing = null;
        this._hasMoved = false; //movement within answer choices
        this.gameStarted = false;
        this.currentImageData = {};
        this._questionChoiceIndex = 0;
        this._waitingForResponse = false;    //waiting for user input
        this._keyHasGoneUp = true;
        
        //listen for options updates
        dojo.subscribe("optionsUpdate", dojo.hitch(this, function(data) {
            this._updateOptions(data);
        }));
        var def = uow.getAudio({defaultCaching: true});    //get JSonic
        def.addCallback(dojo.hitch(this, function(audio) 
        { 
            this._audio = audio;
            this.audioSub = dojo.subscribe("audioVolume", dojo.hitch(this, function(newVolume){
                this._audio.setProperty({name : 'volume', value: newVolume, immediate : true});
                this._audio.setProperty({name : 'volume', value: newVolume, channel : 'second', immediate : true});
            }));
            var constructorHandle = dojo.subscribe("categoryGameEngineStartup", dojo.hitch(this, function(message){
                if (message == "postCreate_ready" && !this.gameStarted) {
                    this._loadingDialog._alreadyInitialized = true;
                    this._loadingDialog.hide();
                    this.gameStarted = true;
                    dojo.unsubscribe(constructorHandle);
                    this._startGame();
                }
            }));
            dojo.publish("categoryGameEngineStartup", ["constructor_ready"]);
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
        this._categories = this.gameData.Categories;
        this.gameImage = dojo.byId("gameImage");
        //this was stuck in to overcome the "broken image" image in chrome. probably a better way
        this._changeGameImage({ 
            "url": "images/white.jpg", 
            "width": 1, 
            "height": 1
        });
        this._randomize(this._categories);  //randomize the contents of the categories
        this.rewardImages = this.hark.rewardImages;
        this.connect(dojo.global, 'onresize', 'resizeGameImage');
        var postCreateHandle = dojo.subscribe("categoryGameEngineStartup", dojo.hitch(this, function(message){
            if (message == "constructor_ready" && !this.gameStarted) {
                this._loadingDialog._alreadyInitialized = true;
                this._loadingDialog.hide();
                this.gameStarted = true;
                dojo.unsubscribe(postCreateHandle);
                this._startGame();
            }
        }));
        dojo.publish("categoryGameEngineStartup", ["postCreate_ready"]);
    },
    
    //  called when game starts AND user has not yet changed anything in options menu
    //  could just get from HTML, but setup wont even be used on HTS.org
    _presetOptions: function() {
        this.moverSwitch = "None";
        this.chooserSwitch = "None";
        this.askAboutQuit = false;
        this.moverSwitch = "None";
        this.chooserSwitch = "None";
        this.repeatRounds = false;
        this.pairAnswers = false;
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
        this.findVisibleImageArea();
        this.connect(dojo.global, 'onkeydown', '_analyzeKey');
        this.connect(dojo.global, 'onkeyup', '_removeKeyDownFlag');
        this._audio.say({ text: "welcome to " + this.gameData.Name }).callAfter(dojo.hitch(this, function() {
            if(this) {
                this.findVisibleImageArea();
                this._runNextQuestion();
            }
        }));
    },
  
    //  initiates everything to do with next question
    _runNextQuestion: function() {
        this._setQuestionType();   
        this._setAnswerChoices();   //could move this to be going while question is being asked
        this._askQuestion();    //now start the game
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
    

    //  randomly chooses which type of question to ask
    _setQuestionType: function() {
        var questionTypes = ["exclusive", "inclusive"];
        this._questionType = questionTypes[Math.floor(Math.random()*questionTypes.length)]; 
    },
    
    //  builds the answer choice array based on the question type
    _setAnswerChoices: function() {
        if (this._questionType == null) {console.log("Question Type was never set.")}
        else if (this._questionType == "exclusive") { 
            this._answerChoices = this._buildExclusiveChoices();
        }
        else if (this._questionType == "inclusive") {
            this._answerChoices = this._buildInclusiveChoices();
        }
        else { console.log("New Question type added that hasn't been accounted for!!!");}
        this._questionAttempts = 0;
        this._questionChoiceIndex = 0;
        this._hasMoved = false;
    },
    
    // picks one thing that is not from this._categories[this._categoreiesIndex] and the rest from  
    // this._categories[this._categoreiesIndex]. 
    // @return the array
    _buildExclusiveChoices: function() {
        var thingsInCurrentCategory = dojo.map(this._categories[this._categoriesIndex].Things, function(item) {return item;});
        this._randomize(thingsInCurrentCategory); //because we are just going to pop things off later
        var choices = [];
        var thingIndices = 0;
        while (thingIndices < (this._choicesPerRound - 1)) { //all in same category but one
            choices[thingIndices] = thingsInCurrentCategory.pop();
            thingIndices++;
        }
        //build array of all indices
        var index = 0;
        var allIndices = [];

        while(index < this._categories.length) {
            allIndices.push(index);
            index++;
        } 
        //remove current index 
        var otherCategoryIndices = this._removeUnwantedArrayItem(allIndices, this._categoriesIndex);
        //add randomThing from random category
        var randomCategory = this._categories[otherCategoryIndices[Math.floor(Math.random()*otherCategoryIndices.length)]];
        this.correctThing = randomCategory.Things[Math.floor(Math.random()*randomCategory.Things.length)]; //get random thing
        choices[this._choicesPerRound - 1] = this.correctThing;   //last thing
        this._randomize(choices);
        //now find where the correct one is at
        this._correctChoiceIndex = this._findCorrectAnswerIndex(choices, this.correctThing.Name);
        return choices;
    },
   
    // picks 1 thing from this._categories[this._categoreiesIndex] and rest from other categories
    // @return the array
    _buildInclusiveChoices: function() { 
        var thingsInCurrentCategory = dojo.map(this._categories[this._categoriesIndex].Things, function(item){return item;});
        this._randomize(thingsInCurrentCategory); //because we are just going to pop things off later
        
        var choices = [];
        this.correctThing = thingsInCurrentCategory.pop();
        choices[0] = this.correctThing;  //add the one from this category
        //add the three randomly chosen
        
        var index = 0;
        var allIndices = [];
        while(index < this._categories.length) {
            allIndices.push(index);
            index++;
        }
        var otherCategoryIndices = this._removeUnwantedArrayItem(allIndices, this._categoriesIndex);
        while(choices.length < this._choicesPerRound){
            var randomCategoryIndex = otherCategoryIndices[Math.floor(Math.random()*otherCategoryIndices.length)];
            var randomCategory = this._categories[randomCategoryIndex];
            var randomThing = randomCategory.Things[Math.floor(Math.random()*randomCategory.Things.length)]; //get random thing
            choices.push(randomThing);
            otherCategoryIndices = this._removeUnwantedArrayItem(otherCategoryIndices, randomCategoryIndex);
        };
        this._randomize(choices);
        this._correctChoiceIndex = this._findCorrectAnswerIndex(choices, this.correctThing.Name);
        
        return choices;
    },  
  
    //  @return an array containing all elements of input array except for item
    _removeUnwantedArrayItem: function(array, itemPassedIn) {
        var toReturn = [];
        dojo.forEach(array, function(itemFromArray) {
            if (itemFromArray == itemPassedIn) {
                //dont' add it
            }
            else { //add it 
                toReturn.push(itemFromArray);
            }
        });
        return toReturn;
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

    //  Asks the question
    _askQuestion: function() {
        //note that Exclusion_Question & Inclusion_Question are arrays
        if (this._questionType == null) {console.log("Question Type was never set.")}
        else if (this._questionType == "exclusive") {
            var shallowCopy = dojo.map(this._categories[this._categoriesIndex].Exclusion_Question, function(item) {return item;});
            this._randomize(shallowCopy);
            var question = shallowCopy.pop();
            this._currentQuestion = question;
        }
        else if (this._questionType == "inclusive") {
            var shallowCopy = dojo.map(this._categories[this._categoriesIndex].Inclusion_Question, function(item) {return item;});
            this._randomize(shallowCopy);
            var question = shallowCopy.pop();
            this._currentQuestion = question;
        }
        else { console.log("New Question type added that hasn't been accounted for!!!");}
        this._audio.say({text: this._currentQuestion}).callAfter(dojo.hitch(this, function() {
            //wait for timeout to accept response
            setTimeout(dojo.hitch(this, function(){this._waitingForResponse = true;}), this.promptTime*1000);    
        }));
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
  
    //  reads off the answer choice of this._questionChoiceIndex
    _updateDescription: function() {
        this._audio.stop();
        var images = dojo.map(this._answerChoices[this._questionChoiceIndex].Picture, function(item){return item;});
        if (images.length >= 1 ){
            this._randomize(images);
            var imageData = images.pop();
            this._changeGameImage(imageData);
        }
        this.choiceNode.innerHTML = "Choice: " + String(this._answerChoices[this._questionChoiceIndex].Name);
        this._audio.say({text: this._answerChoices[this._questionChoiceIndex].Name});
    },
    
    //  this was pulled out to allow hark frame to kill the game -- hashing
    endGame: function() {
        this._audio.stop();
        this._waitingForResponse = false;
        this.choiceNode.innerHTML = "Choice: "
        //add node back in case another game instantiated
        var actionNode = dojo.byId("actionPane");
        dojo.place("<div id='gameGoesHere'></div>", actionNode );
        this.destroyRecursive();
    },
    
    _moveSequence: function(evt) {
        evt.preventDefault();
        //increment current choice index then read
        this._incrementChoiceIndex();
        this._updateDescription();
    },
    
    _chooseSequence: function(evt) {
        evt.preventDefault();
        if(!this._hasMoved) { //has not yet moved to select                        
            this._audio.stop();
            this._audio.say({text: "You must move through the choices before you can select an answer."});
        }
        else { //check if correct
            this._questionAttempts++;
            if (this._correctChoiceIndex == this._questionChoiceIndex) {//correct
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
                    this._askQuestion();
                }
                else if (this.hark._keyIsLeftArrow(evt)){ //then attempted to move
                    evt.preventDefault();
                    //increment current choice index then read
                    this._decrementChoiceIndex();
                    this._updateDescription();
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
    
    //  used for changing game Image. resizing is done in this.resizeGameImage. This is for getting
    //  the proper aspect ratio upon insertion of a new image src    
    _changeGameImage: function(imageData) {
        this.currentImageData = imageData;
        this.findVisibleImageArea();
        //get rid of current image or else you will see it size to next images' dimensions
        dojo.addClass(this.gameImage, "hidden");

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
        
    },
    
    //  finds available space for game image and sets this.availableWidth and this.availableHeight
    findVisibleImageArea: function () {
        this.availableWidth = dojo.global.innerWidth - 25;   //25 is for padding and div's
        var rewardTopPosition = this.hark.getElementTopPosition(this.gameImage);
        this.availableHeight = dojo.global.innerHeight - rewardTopPosition - 25 ; //25 is for padding
        //console.log("gameNode: ", this.hark.getElementTopPosition(dojo.byId("gameGoesHere")));
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
    
    _goodChoice: function() {
        //how to determine how many rewards are in folder???
        this.choiceNode.innerHTML = "Choice: ";
        this._waitingForResponse = false; 
        var imageData = dojo.clone(this.rewardImages);
        this._randomize(imageData);
        var image = imageData.pop();
        this._changeGameImage(image);
        var soundData = dojo.clone(this.hark.rewardSounds);
        this._randomize(soundData);
        var sound = soundData.pop();
        this._audio.stop();
        this._audio.play({url: sound.url}).callAfter(dojo.hitch(this, function() {
            dojo.addClass("gameImage", "hidden");
            this.gameImage.src = "images/white.jpg"; //because of chrome's display issues
            this._incrementCategoriesIndex();
            this._runNextQuestion();
        }));
        
    },
    
    _badChoice: function() {
        if ((this._questionAttempts >= 2) && (this.correctThing.Hint.length >= 1)) {// then going to give a hint
            //this prevents the too early click unless necesary
            this._waitingForResponse = false;
            var doHint = true;
        }
        else{
            var doHint = false;
        }
        var responses = ["Try Again", "Oops, try again", "You can do it, try again"];
        var randomResponse = responses[Math.floor(Math.random()*responses.length)];
        this._audio.stop();
        this._audio.say({text: randomResponse}).callAfter(dojo.hitch(this, function() {
            if (doHint) {
                    var hints = dojo.map(this.correctThing.Hint, function(item){return item;});
                    this._randomize(hints);
                    var hint = hints.pop();
                    var def = this.sayOrPlay("Hint: " + hint);
                    def.callAfter(dojo.hitch(this, function() {
                        this._waitingForResponse = true;
                    }));
            }
        }));
    },
    
    //  says or plays the string that is passed in. Assumes that if url passed it, root is "Sounds"
    //  @return the deferred 
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
    
    //  sets this._questionChoiceIndex to 0 if previously at max, otherwise add 1
    _incrementChoiceIndex: function() {
        this._hasMoved = true;
        if (this._questionChoiceIndex == (this._answerChoices.length-1)) {
            this._questionChoiceIndex = 0;
        }
        else {
            this._questionChoiceIndex++;
        }    
    },
    
    //  sets this._questionChoiceIndex to (this._answerChoices.length-1) if previously 0, otherwise subtract 1
    _decrementChoiceIndex: function() {
        this._hasMoved = true;
        if (this._questionChoiceIndex == 0) {
            this._questionChoiceIndex = (this._answerChoices.length-1);
        }
        else {
            this._questionChoiceIndex--;
        }    
    },

    //  sets this._categoriesIndex to 0 if previously this._categoriesIndex == (this._categories.length-1)
    //  otherwise increment this._categoriesIndex
    _incrementCategoriesIndex: function() {
        if (this._categoriesIndex == (this._categories.length-1)) { //probably should end it here
            this._categoriesIndex = 0;
        }
        else {this._categoriesIndex ++;}
    },
    
    uninitialize: function() {
        dojo.unsubscribe(this.audioSub);
        var handle = dojo.subscribe("gameExit", dojo.hitch(this, function(){
            dojo.unsubscribe(handle);
        }));
        dojo.publish("gameExit", ["widgetDestroyed"]);
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
