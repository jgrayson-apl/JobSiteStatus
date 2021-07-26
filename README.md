# JobSite Status
This application allows users to dynamically inspect the status of a job site over various construction phases and times using orthorectified images, integrated meshes, and building scene layers.
       

## How to configure your own content

* Create a new public Group in ArcGIS.com.
* Share content as layer items to the Group.
  * Orthomosaic as Tiled Layer
    * Displayed in 2D view
  * Integrated Mesh as Scene Layer
    * Displayed in 3D view
  * Building Layer as Scene Layer (optional, one per project/job site)
    * Displayed in 3D view
 

### Item Tags 

Critical to the process is providing some standardized details about each flight to the app.  We currently use the following information: collection date, drone brand, flight type/mode, view type (based on camera gimbal angle).  We don’t want users to have to change the title, snippet, or description of their items to provide this info, so using a special custom tag for the items is the simplest approach.
 
* Building Tag (static)
    * jobsite.building 
                            

* Ortho and Mesh Tag Template
    * jobsite.{DATE}.{DRONE}.{FLIGHT}.{VIEW}
      * {DATE} = YYYYMMDD
      * {DRONE} = no spaces or special characters
      * {FLIGHT} = no spaces or special characters
      * {VIEW} = no spaces or special characters
  

#### Example Ortho and Mesh Tags
* jobsite.20191203.Phantom.Orbit.Oblique
* jobsite.20190730.Matrice.Survey.Nadir   

> Note: these are not separate tags; we’ll have one tag per item to hold the 4 pieces of information.

