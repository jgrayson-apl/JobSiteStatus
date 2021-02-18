/**
 *
 * SiteScanAPI
 *  - Site Scan API (2.0.0)
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  12/2/2020 - 2.0.0 -
 * Modified:
 *
 */
define([
  "esri/core/Accessor",
  "esri/core/promiseUtils",
  "esri/request",
  "./SiteScanUser"
], function(Accessor, promiseUtils, esriRequest, SiteScanUser){

  const SiteScanAPI = Accessor.createSubclass({
    declaredClass: "SiteScanAPI",

    // API BASE URL //
    BASE_URL: 'https://sitescan-api.arcgis.com/api',
    // API VERSION //
    API_VERSION: 'v2',

    // PROPERTIES //
    properties: {
      user: {
        type: SiteScanUser,
        set: function(user){
          this._set('user', user);
          this.token = (this.user != null) ? this.user.token : null;
        }
      },
      token: {
        type: String,
        set: function(token){
          this._set('token', token);
          if(!this.token){
            this.organizations = null;
          } else {
            this._getOrganizations().then((organizations) => {
              this.organizations = organizations;
            });
          }
        }
      },
      organizations: {
        type: Array.of(Object),
        dependsOn: ['token'],
        set: function(organizations){
          this._set('organizations', organizations);
          if(!this.organizations){
            this.organization = null;
          } else {
            if(this.organizations.length){
              this._getOrganizationById(this.organizations[0].id).then(organization => {
                this.organization = organization;
              });
            }
          }
        }
      },
      organization: {
        type: Object,
        dependsOn: ['organizations'],
        set: function(organization){
          this._set('organization', organization);
          if(!this.organization){
            this.projects = null;
          } else {
            this._getOrganizationProjects(organization.id).then((projects) => {
              this.projects = projects.sort((a, b) => {
                return (new Date(b.updated)).valueOf() - (new Date(a.updated)).valueOf();
              });
            });
          }
        }
      },
      projects: {
        type: Array.of(Object),
        dependsOn: ['organization'],
        set: function(projects){
          this._set('projects', projects);
          if(!this.projects){
            this.project = null;
          } else {
            if(this.projects.length){
              this.getProjectById(this.projects[0].id).then(project => {
                this.project = project;
              });
            }
          }
        }
      },
      project: {
        type: Object,
        dependsOn: ['projects'],
        set: function(project){
          this._set('project', project);
          if(!this.project){
            this.missions = null;
          } else {
            this._getProjectMissions(project.id).then(missions => {
              this.missions = missions.sort((a, b) => {
                return (new Date(b.created)).valueOf() - (new Date(a.created)).valueOf();
              });
            });
          }
        }
      },
      missions: {
        type: Array.of(Object),
        dependsOn: ['project']
      },
      ready: {
        type: Boolean,
        value: false
      }
    },

    /**
     *
     * @param method
     * @param query
     * @returns {Promise}
     * @private
     */
    _callAPI: function(method, query){
      return promiseUtils.create((resolve, reject) => {
        if(this.token != null){

          esriRequest(`${this.BASE_URL}/${this.API_VERSION}/${method}`, {
            headers: { 'Authorization': `Bearer ${this.token}` },
            query: query || {}
          }).then(response => {
            resolve(response.data);
          }).catch(reject);

        } else {
          reject(new Error('Missing SiteScan API user authorization token'));
        }
      });
    },

    /**
     *
     * @param userEmail
     * @param userPassword
     * @private
     */
    _authenticate: function(userEmail, userPassword){
      return promiseUtils.create((resolve, reject) => {

        const userEmailPassword = btoa(`${userEmail}:${userPassword}`);

        esriRequest(`${this.BASE_URL}/${this.API_VERSION}/auth/session/api`, {
          headers: { 'Authorization': `Basic ${userEmailPassword}` },
          method: 'post'
        }).then(response => {
          resolve(response.data);
        }).catch(reject);

      });
    },

    /**
     *
     * @returns {Promise}
     */
    _getOrganizations: function(){
      return promiseUtils.create((resolve, reject) => {
        this._callAPI(`users/me/organizations`).then(resolve).catch(reject);
      });
    },

    /**
     *
     * @param organizationId
     * @returns {Promise<Object>}
     * @private
     */
    _getOrganizationById: function(organizationId){
      return promiseUtils.create((resolve, reject) => {
        this._callAPI(`organizations/${organizationId}`).then(resolve).catch(reject);
      });
    },

    /**
     *
     * @param organizationId
     * @returns {Promise<Object[]>}
     * @private
     */
    _getOrganizationProjects: function(organizationId){
      return promiseUtils.create((resolve, reject) => {
        this._callAPI(`organizations/${organizationId}/projects`).then(resolve).catch(reject);
      });
    },

    /**
     *
     * @param projectId
     * @returns {Promise<Object[]>}
     */
    _getProjectMissions: function(projectId){
      return promiseUtils.create((resolve, reject) => {
        this._callAPI(`projects/${projectId}/missions`).then(resolve).catch(reject);
      });
    },

    /**
     *
     * @param missionId
     * @returns {Promise<Object>}
     * @private
     */
    _getMissionFlight: function(missionId){
      return promiseUtils.create((resolve, reject) => {
        this._callAPI(`missions/${missionId}`).then(resolve).catch(reject);
      });
    },

    /**
     *
     * @param userEmail
     * @param userPassword
     * @returns {Promise<Object>}
     */
    signIn: function(userEmail, userPassword){
      return promiseUtils.create((resolve, reject) => {
        this._authenticate(userEmail, userPassword).then(signInResponse => {

          // SITE SCAN USER //
          const user = new SiteScanUser({ token: signInResponse.token, ...signInResponse.user });

          resolve(user);
        }).catch(reject);
      });
    },

    /**
     *
     * @param organizationId
     * @returns {Promise<Object>}
     */
    getOrganizationById: function(organizationId){
      return promiseUtils.create((resolve, reject) => {
        if(this.organizations){
          const organization = this.organizations.find(organization => {
            return (organization.id === organizationId);
          });
          resolve(organization);
        } else {
          reject(new Error('Organizations have not been initialized.'));
        }
      });
    },

    /**
     *
     * @param projectId
     * @returns {Promise<Object>}
     */
    getProjectById: function(projectId){
      return promiseUtils.create((resolve, reject) => {
        if(this.projects){
          const project = this.projects.find(project => {
            return (project.id === projectId);
          });
          resolve(project);
        } else {
          reject(new Error('Projects have not been initialized.'));
        }
      });
    },

    /**
     *
     * @param missionId
     * @returns {Promise<Object>}
     */
    getFlightDataById: function(missionId){
      return promiseUtils.create((resolve, reject) => {
        this._getMissionFlight(missionId).then((flightInfo) => {
          resolve(flightInfo);
        }).catch(reject);
      });
    }

  });
  SiteScanAPI.version = "2.0.0";

  return SiteScanAPI;
});
