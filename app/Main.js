/*
  Copyright 2020 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/dom-construct",
  "esri/request",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/Map",
  "esri/views/MapView",
  "esri/views/SceneView",
  "esri/layers/Layer",
  "esri/geometry/projection",
  "esri/geometry/SpatialReference",
  "esri/geometry/support/webMercatorUtils",
  "esri/widgets/Home",
  "esri/widgets/Print",
  "esri/widgets/Compass",
  "esri/widgets/Measurement",
  "esri/widgets/BuildingExplorer",
  "esri/widgets/Slice/SliceViewModel"
], function(calcite, declare, ApplicationBase,
            i18n, itemUtils, domHelper, domConstruct,
            esriRequest, IdentityManager, Evented, watchUtils, promiseUtils, Portal,
            EsriMap, MapView, SceneView, Layer,
            projection, SpatialReference, webMercatorUtils,
            Home, Print, Compass, Measurement,
            BuildingExplorer, SliceViewModel){

  return declare([Evented], {

    /**
     *
     */
    constructor: function(){
      // BASE //
      this.base = null;
      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: async function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      this.base = base;

      // TITLE //
      domHelper.setPageTitle(this.base.config.title || 'JobSite Status');
      document.querySelectorAll('.app-title').forEach(node => node.innerHTML = this.base.config.title);

      // DESCRIPTION //
      this.base.config.description && document.querySelectorAll('.app-description').forEach(node => node.innerHTML = this.base.config.description);

      // GROUP INFO //
      this.base.groupInfo = this.base.results.groupInfos[0].value.results[0];
      if(!this.base.groupInfo){
        throw new Error(`Can't find configured Group: ${this.base.config.group}`);
      }

      // GROUP ITEMS //
      this.base.groupItems = await this.getAllGroupItems(this.base.results.groupItems[0].value);
      if(this.base.groupItems && !this.base.groupItems.length){
        throw new Error(`No relevant items found in Group: ${this.base.config.group}`);
      }

      // STARTUP DIALOG //
      this.initializeStartupDialog();

      // GET FLIGHT LAYERS //
      this.getFlightLayers().then(({ jobsiteLayers, initialExtent }) => {

        // SCENE AND MAP VIEWS //
        Promise.all([
          this.createSceneView(initialExtent),
          this.createMapView(initialExtent)
        ]).then(([sceneView, mapView]) => {
          // SYNC VIEWS //
          this.initializeSyncedViews([sceneView, mapView]);
          // APPLICATION READY //
          this.applicationReady(jobsiteLayers, sceneView, mapView);
        });

      }).catch(console.error);

    },

    /**
     *
     * @param initialGroupItemsResponse
     * @returns {Promise}
     * @private
     */
    getAllGroupItems: function(initialGroupItemsResponse){
      return promiseUtils.create((resolve, reject) => {

        // MAX ITEM SEARCH COUNT //
        const maxItems = 100;

        // INITIAL RESULTS //
        let initialItems = initialGroupItemsResponse.results;
        // Q:ARE THERE MORE ITEMS TO RETRIEVE? //
        if(initialGroupItemsResponse.nextQueryParams.start > -1){

          // CREATE AN ARRAY OF QUERIES TO GET BACK ALL ITEMS ASYNC //
          const itemQueries = [];
          for(let nextStart = initialGroupItemsResponse.nextQueryParams.start;
              nextStart < initialGroupItemsResponse.total;
              nextStart += maxItems){

            const nextQueryParams = {
              num: maxItems,
              start: nextStart,
              query: initialGroupItemsResponse.nextQueryParams.query,
              sortField: initialGroupItemsResponse.nextQueryParams.sortField,
              sortOrder: initialGroupItemsResponse.nextQueryParams.sortOrder
            }

            itemQueries.push(this.base.portal.queryItems(nextQueryParams));
          }
          // WHEN ALL QUERIES HAVE COMPLETED //
          Promise.all(itemQueries).then(allQueryResponses => {
            // CONCAT ALL RESULTS //
            const allItems = allQueryResponses.reduce((items, queryResponse) => {
              return items.concat(queryResponse.results);
            }, initialItems);
            // SEND BACK ALL ITEMS //
            resolve(allItems);
          }).catch(reject);
        } else {
          // SEND BACK INITIAL ITEMS //
          resolve(initialItems);
        }
      });
    },

    /**
     *
     */
    initializeStartupDialog: function(){

      // APP ID //
      const appID = `show-startup-${location.pathname.split('/')[2]}`;

      // STARTUP DIALOG //
      const showStartup = localStorage.getItem(appID) || 'show';
      if(showStartup === 'show'){
        calcite.bus.emit('modal:open', { id: 'app-details-dialog' });
      }

      // HIDE STARTUP DIALOG //
      const hideStartupInput = document.getElementById('hide-startup-input');
      hideStartupInput.checked = (showStartup === 'hide');
      hideStartupInput.addEventListener('change', () => {
        localStorage.setItem(appID, hideStartupInput.checked ? 'hide' : 'show');
      });

    },

    /**
     *
     * @param initialExtent
     * @returns {Promise<SceneView>}
     */
    createSceneView: function(initialExtent){
      return promiseUtils.create((resolve, reject) => {

        const sceneView = new SceneView({
          container: 'scene-view-container',
          map: new EsriMap({
            basemap: 'topo-vector',
            ground: 'world-elevation'
          }),
          constraints: { snapToZoom: false, maxZoom: 0 },
          extent: initialExtent.clone()
        });
        sceneView.when(() => {
          sceneView.container.classList.remove('loading');
          // LOADING INDICATOR //
          this.initializeLoadingIndicator(sceneView);

          // HOME //
          const home = new Home({ view: sceneView });
          sceneView.ui.add(home, { position: "top-left", index: 0 });

          watchUtils.whenFalseOnce(sceneView, 'updating').then(() => {
            resolve(sceneView);
          }).catch(reject);
        }).catch(reject);
      });
    },

    /**
     *
     * * @param initialExtent
     * @returns {Promise<MapView>}
     */
    createMapView: function(initialExtent){
      return promiseUtils.create((resolve, reject) => {

        const mapView = new MapView({
          container: 'map-view-container',
          map: new EsriMap({
            basemap: 'topo-vector'
          }),
          constraints: { snapToZoom: false },
          extent: initialExtent.clone()
        });
        mapView.when(() => {
          mapView.container.classList.remove('loaded');
          // LOADING INDICATOR //
          this.initializeLoadingIndicator(mapView);

          // HOME //
          const home = new Home({ view: mapView });
          mapView.ui.add(home, { position: "top-left", index: 0 });

          // COMPASS //
          const compass = new Compass({ view: mapView });
          mapView.ui.add(compass, { position: "top-left" });

          // PRINT //
          this.initializeViewPrint(mapView);

        }).catch(reject);

        resolve(mapView);
      });
    },

    /**
     *
     * @param view {MapView | SceneView}
     */
    initializeLoadingIndicator: function(view){

      // LOADING //
      const updatingNode = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updatingNode);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updatingNode);
      view.ui.add(updatingNode, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        updatingNode.classList.toggle("is-active", updating);
      });

    },

    /**
     * APPLICATION READY
     *
     * @param jobsiteLayers
     * @param sceneView
     * @param mapView
     */
    applicationReady: function(jobsiteLayers, sceneView, mapView){
      return promiseUtils.create((resolve, reject) => {

        // TOOLS PANEL //
        this.initializeToolsPanel(sceneView, mapView);
        // SPIN TOOLS //
        this.initializeViewSpinTools(sceneView);
        // MEASUREMENT //
        this.initializeMeasurement(sceneView, mapView);
        // SLICE //
        this.initializeSlice(sceneView);

        // FLIGHT LAYERS //
        this.initializeFlightLayers(jobsiteLayers, sceneView, mapView).then(() => {

          // BUILDING SCENE LAYER //
          this.initializeBuildingLayer(sceneView).then(() => {

            // HEADER TOOLS //
            const headerTools = document.getElementById('header-tools');
            headerTools.classList.remove('btn-disabled');

            // ENABLE FILTER PANEL //
            const filtersSection = document.getElementById('filters-section');
            filtersSection.classList.remove('btn-disabled');

            // ENABLE FLIGHTS LIST //
            this.enableFlightsList(true);

            // TOGGLE VIEW TYPE //
            this.initializeViewTypeToggle(sceneView, mapView);

            resolve();
          }).catch(reject);
        }).catch(reject);

      });
    },

    /**
     *
     * @param sceneView
     */
    initializeBuildingLayer: function(sceneView){
      return promiseUtils.create((resolve, reject) => {

        // BUILDING LAYER //
        const buildingLayer = sceneView.map.layers.find(layer => { return (layer.type === "building-scene"); });
        if(buildingLayer){
          buildingLayer.load().then(() => {
            buildingLayer.visible = true;

            // BUILDING EXPLORER //
            this.initializeBuildingExplorer(sceneView, buildingLayer).then(resolve).catch(reject);

          });
        } else { resolve(); }
      });
    },

    /**
     *
     * @param sceneView
     * @param mapView
     */
    initializeViewTypeToggle: function(sceneView, mapView){

      // DISPLAY TYPE INPUT //
      const displayTypeInput = document.getElementById("display-type-input");
      displayTypeInput.addEventListener("change", () => {
        document.querySelectorAll(".view-container").forEach(node => {
          "view-active animation-fade-out animation-fade-in".split(' ').forEach(cls => node.classList.toggle(cls));
        });
        // VIEW TYPE CHANGE //
        this.emit("display-type-change", { type: (displayTypeInput.checked ? "3d" : "2d") });
      });
      // DISPLAY TYPE SWITCH //
      document.getElementById('display-type-switch').classList.remove('btn-disabled');

      this.getCurrentView = () => {
        return (displayTypeInput.checked ? sceneView : mapView);
      };

    },

    /**
     *
     * @param sceneView
     * @param mapView
     */
    initializeToolsPanel: function(sceneView, mapView){

      // TOOLS PANEL //
      const toolsPanel = document.getElementById("tools-panel");
      sceneView.ui.add(toolsPanel);
      toolsPanel.classList.remove('hide');

      // VIEW TYPE CHANGE //
      this.on("display-type-change", ({ type }) => {
        if(type === '3d'){
          sceneView.ui.add(toolsPanel);
        } else {
          mapView.ui.add(toolsPanel);
        }
      });

    },

    /**
     *
     * @param mapView
     */
    initializeViewPrint: function(mapView){

      // PRINT NODE //
      const printActionNode = document.getElementById('print-action-node');
      // VIEW TYPE CHANGE //
      this.on("display-type-change", ({ type }) => {
        printActionNode.classList.toggle("btn-disabled", type !== '2d');
      });

      // PRINT //
      const print = new Print({
        container: 'print-node',
        view: mapView,
        printServiceUrl: "https://utility.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task", //this.base.portal.helperServices.printTask.url,
        templateOptions: {
          title: this.base.config.title,
          copyright: "Esri",
          author: "Geo Experience Center"
        }
      });

    },

    /**
     *
     * @param sceneView
     * @param buildingELayer
     */
    initializeBuildingExplorer: function(sceneView, buildingELayer){
      return promiseUtils.create((resolve, reject) => {

        const buildingExplorer = new BuildingExplorer({
          view: sceneView,
          visibleElements: {
            phases: true,
            disciplines: false
          },
          layers: [buildingELayer]
        });

        const enableBuildingExplorer = (enabled) => {
          if(enabled){
            buildingELayer.visible = true;
            sceneView.ui.add(buildingExplorer, { position: "top-right", index: 0 });
          } else {
            buildingELayer.visible = false;
            sceneView.ui.remove(buildingExplorer);
          }
        };

        const buildingExplorerBtn = document.getElementById('building-explorer-btn');
        buildingExplorerBtn.classList.remove('hide');
        buildingExplorerBtn.addEventListener('click', () => {
          enableBuildingExplorer(buildingExplorerBtn.classList.toggle('selected'));
        });

        // VIEW TYPE CHANGE //
        this.on("display-type-change", ({ type }) => {
          buildingExplorerBtn.classList.remove('selected');
          if(buildingExplorerBtn.classList.toggle('btn-disabled', (type !== '3d'))){
            enableBuildingExplorer(false);
          }
        });

        const goToParams = { tilt: 65.0, heading: 45.0 };
        const goToOptions = { duration: 1500, easing: 'ease-in-out' };

        watchUtils.whenEqualOnce(buildingExplorer.viewModel, 'state', 'ready', () => {
          sceneView.whenLayerView(buildingELayer).then(buildingELayerView => {
            watchUtils.whenNotOnce(buildingELayerView, "updating", () => {
              sceneView.goTo({ ...goToParams, target: sceneView.viewpoint.targetGeometry }, goToOptions).then(() => {
                watchUtils.whenNotOnce(sceneView, "updating", () => {
                  this.fadeOutLayer(buildingELayer).then(() => {

                    // SET INITIAL BUILDING EXPLORER PHASE //
                    buildingExplorer.viewModel.phase.select(buildingExplorer.viewModel.phase.max);
                    enableBuildingExplorer(false);
                    buildingELayer.opacity = 1.0;

                    // SET INITIAL FOCUS TO HTE VIEW //
                    sceneView.focus();

                    // STARTUP COMPLETE //
                    resolve();
                  });
                });
              });
            });
          });
        });

      });
    },

    /**
     *
     * @param sceneView
     */
    initializeSlice: function(sceneView){
      return promiseUtils.create((resolve, reject) => {

        const buildingESlice = {
          "position": {
            "spatialReference": { "wkid": 102100 },
            "x": -13046317.604694624,
            "y": 4036685.421166637,
            "z": 410.0
          },
          "tilt": 0.0,
          "heading": 359.97072441976536,
          "width": 100.0,
          "height": 100.0
        };

        const sliceViewModel = new SliceViewModel({
          view: sceneView,
          tiltEnabled: true,
          excludeGroundSurface: false
        });
        watchUtils.whenEqualOnce(sliceViewModel, 'state', 'ready').then(() => {

          const enableSlice = (enabled) => {
            if(enabled){
              sliceViewModel.shape = buildingESlice;
              sliceViewModel.start();
            } else {
              sliceViewModel.shape = null;
              sliceViewModel.clear();
            }
          };

          const buildingSliceBtn = document.getElementById('building-slice-btn');
          buildingSliceBtn.addEventListener('click', () => {
            enableSlice(buildingSliceBtn.classList.toggle('selected'));
          });

          // VIEW TYPE CHANGE //
          this.on("display-type-change", ({ type }) => {
            buildingSliceBtn.classList.remove('selected');
            if(buildingSliceBtn.classList.toggle('btn-disabled', (type !== '3d'))){
              enableSlice(false);
            }
          });

          sliceViewModel.clear();
          resolve();
        });

      });
    },

    /**
     *
     * @param sceneView
     * @param mapView
     */
    initializeMeasurement: function(sceneView, mapView){

      // MEASUREMENT TOOLS //
      const measurement = new Measurement({ view: sceneView });

      const activateView = (view) => {
        measurement.clear();
        view.ui.add(measurement, "bottom-left");
        measurement.view = view;
      };

      this.on("display-type-change", options => {
        activateView((options.type === "3d") ? sceneView : mapView);
      });
      activateView(sceneView);

      const measurePanel = document.getElementById('measure-panel');
      const measureBtn = document.getElementById('measure-btn');
      const measureLineBtn = document.getElementById('measure-btn-distance');
      const measureAreaBtn = document.getElementById('measure-btn-area');

      measureBtn.addEventListener('click', () => {
        measurePanel.classList.toggle('hide');
        measureBtn.classList.toggle('selected');
        measurement.clear();
        measureAreaBtn.classList.remove('selected', 'btn-disabled');
        measureLineBtn.classList.remove('selected', 'btn-disabled');
      });

      measureLineBtn.addEventListener("click", () => {
        measurement.clear();
        if(measureLineBtn.classList.toggle('selected')){
          measurement.activeTool = (measurement.view.type === "2d") ? "distance" : "direct-line";
          measurement.startMeasurement();

          measureBtn.classList.add('btn-disabled');
          measureLineBtn.classList.add('btn-disabled');
          measureAreaBtn.classList.add('btn-disabled');
          measureAreaBtn.classList.remove('selected');
        }
      });

      measureAreaBtn.addEventListener("click", () => {
        measurement.clear();
        if(measureAreaBtn.classList.toggle('selected')){
          measurement.activeTool = "area";
          measurement.startMeasurement();

          measureBtn.classList.add('btn-disabled');
          measureAreaBtn.classList.add('btn-disabled');
          measureLineBtn.classList.add('btn-disabled');
          measureLineBtn.classList.remove('selected');
        }
      });

      measurement.viewModel.watch('state', state => {
        if(state === 'measured'){
          measureBtn.classList.remove('btn-disabled');
          measureAreaBtn.classList.remove('btn-disabled');
          measureLineBtn.classList.remove('btn-disabled');
        }
      });

    },

    /**
     *
     * @param sceneView
     */
    initializeViewSpinTools: function(sceneView){

      const viewSpinPanel = document.getElementById("view-spin-panel");

      const viewSpinBtn = document.getElementById('view-spin-btn');
      viewSpinBtn.addEventListener('click', () => {
        viewSpinPanel.classList.toggle('hide');
        this.enableSpin(viewSpinBtn.classList.toggle('selected'));
      });

      let spin_direction = "none";
      let spin_step = 0.05;

      const _spin = promiseUtils.debounce(() => {
        if(spin_direction !== "none"){
          const heading = (sceneView.camera.heading + ((spin_direction === "right") ? spin_step : -spin_step));
          sceneView.goTo({
            center: sceneView.center.clone(),
            heading: heading
          }, { animate: false }).then(() => {
            if(spin_direction !== "none"){
              requestAnimationFrame(_spin);
            }
          });
        }
      });

      this.enableSpin = (enabled) => {
        viewSpinPanel.classList.toggle("btn-disabled", !enabled);
        if(!enabled){
          _enableSpin("none");
          spinLeftBtn.classList.remove("selected");
          spinRightBtn.classList.remove("selected");
        }
      };

      const _enableSpin = (direction) => {
        spin_direction = direction;
        if(spin_direction !== "none"){ _spin(); }
      };

      const spinLeftBtn = document.getElementById('spin-left-btn');
      const headingNode = document.getElementById('spin-heading-label');
      const spinRightBtn = document.getElementById('spin-right-btn');

      spinLeftBtn.addEventListener("click", () => {
        spinRightBtn.classList.remove("selected");
        _enableSpin("none");
        if(spinLeftBtn.classList.toggle("selected")){
          _enableSpin("left");
        }
      });

      spinRightBtn.addEventListener("click", () => {
        spinLeftBtn.classList.remove("selected");
        _enableSpin("none");
        if(spinRightBtn.classList.toggle("selected")){
          _enableSpin("right");
        }
      });

      const getHeadingLabel = heading => {
        let label = "N";
        switch(true){
          case (heading < 67):
            label = "NE";
            break;
          case (heading < 113):
            label = "E";
            break;
          case (heading < 157):
            label = "SE";
            break;
          case (heading < 202):
            label = "S";
            break;
          case (heading < 247):
            label = "SW";
            break;
          case (heading < 292):
            label = "W";
            break;
          case (heading < 337):
            label = "NW";
            break;
        }
        return label;
      };

      watchUtils.init(sceneView, "camera.heading", heading => {
        headingNode.innerHTML = getHeadingLabel(heading);
        headingNode.title = heading.toFixed(0);
      });

    },

    /**
     *
     * @param title
     * @param type
     * @param names
     * @private
     */
    _createFilterSelectors: function(title, type, names){

      const filterPanel = document.getElementById('filter-options');
      const filterSet = domConstruct.create('fieldset', { className: 'radio-group trailer-half' }, filterPanel);
      domConstruct.create('legend', { className: "radio-group-title", innerHTML: title }, filterSet);

      ['ALL'].concat(names).forEach(name => {

        const inputNode = domConstruct.create('input', {
          id: `${type}-${name}`,
          className: 'radio-group-input',
          type: 'radio',
          name: type,
          'data-filter': name
        }, filterSet);
        domConstruct.create('label', {
          className: 'radio-group-label font-size--1',
          for: `${type}-${name}`,
          innerHTML: name
        }, filterSet);

        if(name === 'ALL'){
          inputNode.setAttribute('checked', '');
        }
      });

    },

    /**
     *
     * @param layers
     * @private
     */
    unionLayerExtents: function(layers){
      return layers.reduce((extent, layer) => {

        const layerExtentWebMercator = layer.fullExtent.spatialReference.isWebMercator
          ? layer.fullExtent.clone()
          : layer.fullExtent.spatialReference.isWGS84
            ? webMercatorUtils.geographicToWebMercator(layer.fullExtent)
            : projection.project(layer.fullExtent, SpatialReference.WebMercator)

        return (extent != null) ? extent.union(layerExtentWebMercator) : layerExtentWebMercator;
      }, null);
    },

    /**
     *
     * @returns {Promise<>}
     */
    getFlightLayers: function(){
      return promiseUtils.create((resolve, reject) => {

        // VALID PORTAL ITEMS FROM GROUP //
        //  - VALID = IS LAYER AND HAS TAG THAT STARTS WITH 'jobsite.' //
        const jobsiteItems = this.base.groupItems.reduce((validItems, groupItem) => {
          //console.info(groupItem.type, groupItem.typeKeywords, groupItem.name);
          // console.assert((portalLayerItem.access === "public"), portalLayerItem.title, portalLayerItem.access);
          if(groupItem.isLayer && groupItem.tags.find(tag => tag.startsWith('jobsite.'))){
            validItems.push(groupItem);
          }
          return validItems;
        }, []);

        // CURRENT VALID LAYER TYPES //
        const validLayerTypes = ['building-scene', 'integrated-mesh', 'tile'];

        // GET VALID LOADED LAYERS //
        //  - VALID = LAYER TYPE IS BUILDING, MESH, OR TILED //
        const layersLoadedHandles = jobsiteItems.map(jobsiteItem => {
          return Layer.fromPortalItem({ portalItem: jobsiteItem }).then(portalLayer => {
            return portalLayer.load().then(() => {

              if(validLayerTypes.includes(portalLayer.type)){
                portalLayer.set({ visible: false, minScale: 0, maxScale: 0 });
                return portalLayer;
              } else {
                console.warn("Currently unsupported layer type:", jobsiteItem.title, portalLayer.type);
                return null;
              }
            }).catch(reject);
          }).catch(reject);
        });
        // WHEN ALL LAYERS ARE LOADED //
        Promise.all(layersLoadedHandles).then((portalLayers) => {

          // VALID JOBSITE LAYERS //
          const jobsiteLayers = portalLayers.reduce((validLayers, portalLayer) => {
            if(portalLayer != null){
              // VALID LOADED JOBSITE LAYER //
              validLayers.push(portalLayer);
            }
            return validLayers;
          }, []);

          // INITIAL EXTENT //
          const initialExtent = this.unionLayerExtents(jobsiteLayers);

          resolve({ jobsiteLayers, initialExtent });
        }).catch(reject);

      });
    },

    /**
     *
     * @param jobsiteLayers
     * @param sceneView
     * @param mapView
     * @returns {Promise}
     */
    addFlightLayers: function(jobsiteLayers, sceneView, mapView){
      return promiseUtils.create((resolve, reject) => {

        // https://stackoverflow.com/questions/4313841/insert-a-string-at-a-specific-index //
        String.prototype.insertAt = function(index, str){
          return this.slice(0, index) + str + this.slice(index)
        }

        // EXTRACT:
        //  - LIST OF FLIGHT INFOS //
        //  - LIST OF FLIGHT LAYERS //
        //  - LIST OF TYPES //
        const { flightInfosById, flightLayers, types } = jobsiteLayers.reduce((infos, jobsiteLayer) => {
          if(jobsiteLayer == null){
            console.warn('Still have invalid layer...');
            return;
          }

          // ADD TO MAP OR SCENE VIEWS //
          switch(jobsiteLayer.type){
            case 'building-scene':
            case 'integrated-mesh':
              sceneView.map.add(jobsiteLayer);
              break;
            case 'tile':
              mapView.map.add(jobsiteLayer);
              break;
            default:
              console.warn("Unsupported layer:", jobsiteLayer.title, jobsiteLayer.type)
              return null;
          }

          // JOBSITE TAG //
          const jobsiteTag = jobsiteLayer.portalItem.tags.find(tag => tag.startsWith('jobsite.'));
          const jobsiteTagParts = jobsiteTag.split(".");

          // LAYERS WITH FLIGHT RELATED CONTENT //
          if(jobsiteTagParts.length === 5){
            // ALL FLIGHT LAYERS //
            infos.flightLayers.push(jobsiteLayer);

            // FLIGHT INFO //
            const dateStr = jobsiteTagParts[1];
            const droneType = jobsiteTagParts[2];
            // "survey" "crosshatch" "perimeterScan" "inspect" "panorama" "verticalScan" "corridor" //
            const flightType = jobsiteTagParts[3];
            const viewType = jobsiteTagParts[4];

            // TYPES USED TO FILTER FLIGHTS //
            infos.types.drone.add(droneType);
            infos.types.flight.add(flightType);
            infos.types.view.add(viewType);

            // FLIGHT ID //
            const flightId = jobsiteLayer.title = `${dateStr}_${droneType}_${flightType}_${viewType}`;

            // CREATE OR UPDATE FLIGHT INFO //
            let flightInfo = infos.flightInfosById.get(flightId);
            if(!flightInfo){
              flightInfo = {
                layers: [],
                id: flightId,
                date: new Date(dateStr.insertAt(6, '-').insertAt(4, '-')),
                drone: droneType,
                flight: flightType,
                view: viewType
              };
            }
            flightInfo.layers.push(jobsiteLayer);
            infos.flightInfosById.set(flightId, flightInfo);
          }

          return infos;
        }, { flightInfosById: new Map(), flightLayers: [], types: { drone: new Set(), flight: new Set(), view: new Set() } });

        //
        // SET VISIBLE GROUP LAYER //
        //
        this.setVisibleLayersByMission = (flightId) => {
          return promiseUtils.create((resolve, reject) => {
            flightLayers.forEach(layer => {
              layer.visible = (layer.title === flightId);
            });
            resolve();
          });
        };

        resolve({ flightInfosById, types });
      });
    },

    /**
     *
     * @param jobsiteLayers
     * @param sceneView
     * @param mapView
     */
    initializeFlightLayers: function(jobsiteLayers, sceneView, mapView){
      return promiseUtils.create((resolve, reject) => {

        // ALL FLIGHT LAYERS //
        this.addFlightLayers(jobsiteLayers, sceneView, mapView).then(({ flightInfosById, types }) => {

          // COUNT AND TOTAL //
          document.getElementById("count-label").innerHTML = flightInfosById.size;
          document.getElementById("total-label").innerHTML = flightInfosById.size;

          // CREATE FILTERS BASED ON FLIGHT INFORMATION //
          this._createFilterSelectors('Drone Type', 'drone', Array.from(types.drone.values()));
          this._createFilterSelectors('Flight Type', 'flight', Array.from(types.flight.values()));
          this._createFilterSelectors('View Type', 'view', Array.from(types.view.values()));

          const activeSelector = `.mission-list-node:not(.hide)`;
          const utcFormatter = new Intl.DateTimeFormat('default', { timeZone: 'UTC' });

          const flightsContainer = document.getElementById('missions-container');
          this.enableFlightsList = (enabled) => {
            flightsContainer.classList.toggle('btn-disabled', !enabled);
          };

          const flightDetailsPanel = document.getElementById('flight-details-panel');
          const displayFlightDetails = (flightInfo) => {
            const layerDetails = flightInfo.layers.map(flightLayer => {
              const portalItem = flightLayer.portalItem;
              return `
                <div class="font-size-1 content-row">
                  <span>${portalItem.title}</span>
                  <span class="font-size--3 avenir-italic right">${portalItem.type} [${flightLayer.type}]</span>
                </div>
                <div class="panel panel-white">
                  <div class="text-center font-size--1">${portalItem.snippet || '[n/a]'}</div>
                  <div class="leader-half">${portalItem.description || '[no description]'}</div>
                </div>`;
            });
            flightDetailsPanel.innerHTML = layerDetails.join('<br>');
            calcite.bus.emit('modal:open', { id: 'flight-dialog' });
          };

          const goToOptions = { duration: 1500, easing: 'ease-in-out' };

          // LIST OF FLIGHT //
          const flightsList = document.getElementById('missions-list');
          const createMissionList = () => {

            // FLIGHT INFOS //
            const flightInfos = Array.from(flightInfosById.values());

            // SORT FLIGHT INFOS BY DATE //
            flightInfos.sort((a, b) => {
              return (b.date.valueOf() - a.date.valueOf());
            });

            return flightInfos.map((flightInfo, flightInfoIdx) => {

              // FLIGHT NODE //
              //  - id, date, drone, flight, view //
              const flightNode = domConstruct.create('div', {
                id: `mission-${flightInfo.id}`,
                className: 'side-nav-link mission-list-node',
                "data-missionid": flightInfo.id,
                "data-flightdate": utcFormatter.format(flightInfo.date),
                "data-drone": flightInfo.drone,
                "data-flight": flightInfo.flight,
                "data-view": flightInfo.view
              }, flightsList);

              // INITIAL SORT ORDER //
              flightNode.style.order = String(flightInfoIdx);

              // TOP NODE //
              const topNode = domConstruct.create("div", {}, flightNode);

              // DATE //
              domConstruct.create("span", {
                className: 'font-size-2 text-theme',
                innerHTML: utcFormatter.format(flightInfo.date)
              }, topNode);

              // GOTO NODE //
              const gotoNode = domConstruct.create("div", {
                className: 'action-node icon-ui-zoom-in-magnifying-glass right',
                title: 'go to flight extent'
              }, topNode);
              gotoNode.addEventListener('click', clickEvt => {
                clickEvt.stopPropagation();
                if(!flightInfo.extent){
                  flightInfo.extent = this.unionLayerExtents(flightInfo.layers);
                }
                const currentView = this.getCurrentView();
                currentView.goTo(flightInfo.extent.clone(), goToOptions);
              });

              // DETAILS NODES //
              const detailsNode = domConstruct.create("div", {
                className: 'action-node icon-ui-description right',
                title: 'flight details'
              }, topNode);
              detailsNode.addEventListener('click', clickEvt => {
                clickEvt.stopPropagation();
                displayFlightDetails(flightInfo);
              });

              // INFOS //
              const infoNode = domConstruct.create("div", { className: 'content-row' }, flightNode);
              domConstruct.create("div", { innerHTML: flightInfo.drone }, infoNode);
              domConstruct.create("div", { innerHTML: flightInfo.flight }, infoNode);
              domConstruct.create("div", { innerHTML: flightInfo.view }, infoNode);

              // FLIGHT NODE CLICK //
              flightNode.addEventListener('click', () => {

                flightsList.querySelectorAll(`.mission-list-node.selected:not(#mission-${flightInfo.id})`).forEach(node => node.classList.remove('selected'));
                if(flightNode.classList.toggle("selected")){
                  currentMissionIndex = Array.from(document.querySelectorAll(activeSelector)).indexOf(flightNode);
                  displayNextMission(true);
                } else {
                  currentMissionIndex = getResetIndex();
                  setCurrentFlight("none");
                }
              });

              return flightNode;
            });

          };


          // FLIGHT FILTERS //
          this.initializeFlightFilters();

          // FLIGHT FILTERS CHANGE //
          this.on("filter-change", () => {

            activeMissionNodes = document.querySelectorAll(activeSelector);
            currentMissionIndex = getResetIndex();

            document.getElementById("count-label").innerHTML = activeMissionNodes.length.toLocaleString();
            playPauseBtn.classList.toggle("btn-disabled", (activeMissionNodes.length === 0));

            if(activeMissionNodes.length > 0){
              displayNextMission(true);
            } else {
              setCurrentFlight('none');
            }
          });


          //
          //
          //
          //
          //
          //

          // ANIMATION LOOP //
          const loopBtn = document.getElementById("loop-btn");
          loopBtn.addEventListener("click", () => {
            loopBtn.classList.toggle("selected");
          });

          // PLAYBACK PANEL //
          const playbackPanel = document.getElementById("playback-panel");
          // UPDATE PROGRESS //
          const progressNode = document.getElementById("play-pause-progress");

          let progressHandle = null;
          const playProgress = () => {
            progressNode.value = Number(progressNode.max);
            progressHandle && clearInterval(progressHandle);
            progressHandle = setInterval(() => {
              progressNode.value -= 17;
            }, 17);
          };
          const stopProgress = () => {
            progressHandle && clearInterval(progressHandle);
            progressNode.value = Number(progressNode.max);
          };

          const playPauseBtn = document.getElementById("play-pause-btn");

          // CREATE INITIAL LIST OF FLIGHTS //
          const allFlightNodes = createMissionList();

          let activeMissionNodes = document.querySelectorAll(activeSelector);
          let currentMissionIndex = 0;

          const getSortOrder = () => {
            return document.querySelector(".sort-option.selected").dataset.sort;
          };

          const getResetIndex = () => {
            return (getSortOrder() === 'newest') ? 0 : (activeMissionNodes.length - 1);
          };

          // SET CURRENT FLIGHT //
          const setCurrentFlight = (currentMissionId) => {
            return promiseUtils.create((resolve, reject) => {
              this.setVisibleLayersByMission(currentMissionId).then(resolve).catch(reject);
            });
          };

          let timeoutHandle;
          const missionDateLabel = document.getElementById("playback-mission-date-label");

          const displayNextMission = toggleOnly => {
            document.querySelectorAll(".mission-list-node.selected").forEach(node => node.classList.remove("selected"));

            const sortOrder = getSortOrder();
            const canMoveNext = (sortOrder === 'newest')
              ? (currentMissionIndex < activeMissionNodes.length)
              : (currentMissionIndex > -1);
            const nextIndex = (sortOrder === 'newest')
              ? (currentMissionIndex + 1)
              : (currentMissionIndex - 1);
            const resetIndex = (sortOrder === 'newest')
              ? 0
              : (activeMissionNodes.length - 1);

            if(canMoveNext){

              const currentMissionNode = activeMissionNodes[currentMissionIndex];
              currentMissionNode.classList.add("selected");
              if(!toggleOnly){ currentMissionNode.scrollIntoView(); }

              missionDateLabel.innerHTML = currentMissionNode.dataset.flightdate;

              const currentFlightId = currentMissionNode.dataset.missionid;
              setCurrentFlight(currentFlightId).then(() => {

                if(!toggleOnly){
                  playProgress();
                  timeoutHandle && clearTimeout(timeoutHandle);
                  timeoutHandle = setTimeout(() => {
                    stopProgress();
                    if(isPlaying()){
                      currentMissionIndex = nextIndex;
                      displayNextMission();
                    }
                  }, Number(progressNode.max));
                }
              });
            } else {
              if(loopBtn.classList.contains("selected")){
                currentMissionIndex = resetIndex;
                displayNextMission();
              } else {
                resetPlayBtn();
              }
            }
          };
          displayNextMission();

          playPauseBtn.addEventListener("click", () => {
            "icon-ui-play icon-ui-pause".split(' ').forEach(cls => playPauseBtn.classList.toggle(cls));
            if(playPauseBtn.classList.toggle("selected")){
              playbackPanel.classList.remove("hide");
              this.enableFlightsList(false);
              displayNextMission();
            } else {
              playbackPanel.classList.add("hide");
              this.enableFlightsList(true);
              resetPlayBtn();
            }
          });

          const isPlaying = () => playPauseBtn.classList.contains("selected");

          const resetPlayBtn = () => {
            stopProgress();
            playPauseBtn.classList.remove("icon-ui-pause");
            playPauseBtn.classList.add("icon-ui-play");
          };

          // SORT OPTIONS //
          document.querySelectorAll(".sort-option").forEach(node => {
            node.addEventListener("click", (evt) => {
              evt.stopPropagation();
              document.querySelectorAll(".sort-option").forEach(node => node.classList.toggle("selected"));

              const sortOrder = getSortOrder();
              allFlightNodes.forEach((flightNode, flightNodeIdx) => {
                flightNode.style.order = (sortOrder === 'oldest') ? (allFlightNodes.length - flightNodeIdx) : flightNodeIdx;
              });

              currentMissionIndex = getResetIndex();
              displayNextMission(true);
            });
          });

          resolve();
        }).catch(reject);

      });
    },

    /**
     *
     */
    initializeFlightFilters: function(){

      // SELECTORS CONTAINER //
      const selectorsContainer = document.getElementById('selectors-container');

      // UPDATE FLIGHTS LIST //
      const filterFlightsList = () => {

        // CURRENT FILTER VALUES //
        const droneType = document.querySelector('.radio-group-input[name="drone"]:checked').dataset.filter;
        const flightType = document.querySelector('.radio-group-input[name="flight"]:checked').dataset.filter;
        const viewType = document.querySelector('.radio-group-input[name="view"]:checked').dataset.filter;

        // HIDE ALL FILTER CHIP //
        selectorsContainer.querySelectorAll('.filter-selector').forEach(node => node.classList.add('hide'))

        // INITIAL QUERY SELECTOR //
        let querySelector = `.mission-list-node`;
        // HIDE ALL FLIGHT NODES //
        document.querySelectorAll(querySelector).forEach(node => node.classList.add("hide"));

        // DRONE TYPE //
        if(droneType !== 'ALL'){
          // APPEND TO QUERY SELECTOR //
          querySelector += `[data-drone="${droneType}"]`;

          // FILTER SELECTOR //
          const droneSelector = selectorsContainer.querySelector(`.filter-selector[data-filter="drone"]`);
          droneSelector.innerHTML = droneType;
          droneSelector.classList.remove('hide');
        }

        // FLIGHT TYPE //
        if(flightType !== 'ALL'){
          // APPEND TO QUERY SELECTOR //
          querySelector += `[data-flight="${flightType}"]`;

          // FILTER SELECTOR //
          const flightsSelector = selectorsContainer.querySelector(`.filter-selector[data-filter="flight"]`);
          flightsSelector.innerHTML = flightType;
          flightsSelector.classList.remove('hide');
        }

        // VIEW TYPE //
        if(viewType !== 'ALL'){
          // APPEND TO QUERY SELECTOR //
          querySelector += `[data-view="${viewType}"]`;

          // FILTER SELECTOR //
          const viewSelector = selectorsContainer.querySelector(`.filter-selector[data-filter="view"]`);
          viewSelector.innerHTML = viewType;
          viewSelector.classList.remove('hide');
        }
        document.querySelectorAll(querySelector).forEach(node => node.classList.remove("hide"));

        this.emit('filter-change', {});
      };

      // UPDATE FLIGHTS LIST WHEN FILTER SELECTED //
      document.querySelectorAll('.radio-group-input').forEach(input => {
        input.addEventListener('change', () => { filterFlightsList(); });
      });

      // UPDATE FLIGHTS LIST WHEN SELECTOR SELECTED //
      selectorsContainer.querySelectorAll('.filter-selector').forEach(node => {
        node.addEventListener('click', (clickEvt) => {
          clickEvt.stopPropagation();
          // RESET TO DEFAULT SELECTOR //
          document.querySelector(`.radio-group-input[name="${node.dataset.filter}"]:first-of-type`).checked = true;
          // UPDATE FLIGHTS LIST //
          filterFlightsList();
        });
      });

    },

    /**
     *
     * @param layer
     * @returns {Promise}
     */
    fadeOutLayer: function(layer){
      return promiseUtils.create((resolve, reject) => {
        const _fadeOut = () => {
          if(layer.opacity > 0.0){
            layer.opacity -= 0.05;
            requestAnimationFrame(_fadeOut);
          } else { resolve(); }
        }
        requestAnimationFrame(_fadeOut);
      });
    },

    /**
     *
     * @param mapViews
     * @returns {{add: add}}
     */
    initializeSyncedViews: function(mapViews){

      const synchronizeView = (view, others) => {
        others = Array.isArray(others) ? others : [others];

        let viewpointWatchHandle;
        let viewStationaryHandle;
        let otherInteractHandlers;
        let scheduleId;

        const clear = () => {
          if(otherInteractHandlers){
            otherInteractHandlers.forEach((handle) => {
              handle.remove();
            });
          }
          viewpointWatchHandle && viewpointWatchHandle.remove();
          viewStationaryHandle && viewStationaryHandle.remove();
          scheduleId && clearTimeout(scheduleId);
          otherInteractHandlers = viewpointWatchHandle = viewStationaryHandle = scheduleId = null;
        };

        const interactWatcher = view.watch('interacting,animation', (newValue) => {
          if(!newValue){ return; }
          if(viewpointWatchHandle || scheduleId){ return; }

          if(!view.animation){
            others.forEach((otherView) => {
              otherView.viewpoint = view.viewpoint;
            });
          }

          // start updating the other views at the next frame
          scheduleId = setTimeout(() => {
            scheduleId = null;
            viewpointWatchHandle = view.watch('viewpoint', (newValue) => {
              others.forEach((otherView) => {
                otherView.viewpoint = newValue;
              });
            });
          }, 0);

          // stop as soon as another view starts interacting, like if the user starts panning
          otherInteractHandlers = others.map((otherView) => {
            return watchUtils.watch(otherView, 'interacting,animation', (value) => {
              if(value){ clear(); }
            });
          });

          // or stop when the view is stationary again
          viewStationaryHandle = watchUtils.whenTrue(view, 'stationary', clear);
        });

        return {
          remove: () => {
            this.remove = () => {
            };
            clear();
            interactWatcher.remove();
          }
        }
      };

      const synchronizeViews = (views) => {

        let handles = views.map((view, idx, views) => {
          const others = views.concat();
          others.splice(idx, 1);
          return synchronizeView(view, others);
        });

        return {
          remove: () => {
            this.remove = () => { };
            handles.forEach((h) => { h.remove(); });
            handles = null;
          }
        }
      };

      const views = [...mapViews];
      let sync_views_handle = synchronizeViews(views);

      return {
        add: (view) => {
          sync_views_handle && sync_views_handle.remove();
          views.push(view);
          sync_views_handle = synchronizeViews(views);
        }
      };

    }

  });
});
