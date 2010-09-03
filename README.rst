===================
Classic Hark The Sound in the Browser
===================

:Author: Robert Overman
:Description: Current implementation for running equivalent of the downloadable version of Hark the Sound in the browser.

Crude Hierarchy Description
=============

Pointing your browser to the this directory loads the framework. Index file contains the home page layout. The index loads 'htsFrameWork.js' which is the framework for loading the games. No longer does the index.html serve the DOM needs of the game widgets. Transitioning over to having a template for each. Right now the only game engine that loads a functional DOM is the Reaction Game engine, but this one has an issue loading the styling which is being worked on.

Each game type has a corresponding game engine in the 'widgets' directory. Currently the home page loads a table of links to the games. Games open in a new tab for now. The hash value tells framework which game to load. 

Originally this version of hark functioned like the downloadable version. The user first had to move through the game types and pick one. Then the user was presented with the available games to play within in that type. The user selected one and the game loaded. Therein, the hash loading style was an afterthought and there remains much in the code that no longer serves the game, most is noted within. 

Also in the framework there is a fair amount of code not used in the framework but used by all the game engines. It was put there as a first step of possibly pulling some of it onto UOW for more games to use as well. 

Game data is now pulled from the UOW sever. Sounds and images are not up on the sever yet.

**-Options Currently Disabled--The framework listens for options updates which are prompted by the user pressing the submit button in the options menu. The framework publishes the resulting data for the game engine to utilize. 

Other Notes
=============

None of the images or sounds are up here. 
