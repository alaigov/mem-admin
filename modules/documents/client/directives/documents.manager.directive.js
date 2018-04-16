'use strict';
angular.module('documents')
  .filter('documentDateFilter', filterDocumentDate)
  .directive('documentMgr', ['_', 'moment', 'Authentication', 'DocumentMgrService', 'AlertService', 'ConfirmService', 'TreeModel', 'ProjectModel', 'Document', 'FolderModel', function (_, moment, Authentication, DocumentMgrService, AlertService, ConfirmService, TreeModel, ProjectModel, Document, FolderModel) {
    return {
      restrict: 'E',
      scope: {
        project: '=',
        opendir: '='
      },
      templateUrl: 'modules/documents/client/views/document-manager.html',
      controller: function ($scope, $filter, $log, $uibModal, $timeout, _, moment, Authentication, DocumentMgrService, TreeModel, ProjectModel, Document, CollectionModel) {
        var tree = new TreeModel();
        var self = this;
        self.busy = true;

        $scope.copyClipboardSuccess = function(e) {
          var txt = e.trigger.getAttribute('data-doc-name');
          AlertService.success('Link copied for ' + txt, 4000);
          e.clearSelection();
        };

        $scope.copyClipboardError = function(/* e */) {
          AlertService.error('Copy link failed.', 4000);
        };

        if ($scope.opendir) {
          try {
            self.opendir = $scope.opendir.substr(1,$scope.opendir.length - 1);
            self.opendir = self.opendir.split('=');
            self.opendir = parseInt(self.opendir[1]);
          } catch (e) {
            // swallow error
          }
          self.openDir = null;
        }

        $scope.authentication = Authentication;

        ProjectModel.getProjectDirectory($scope.project)
          .then( function (dir) {
            $scope.project.directoryStructure = dir || {
              id: 1,
              lastId: 1,
              name: 'ROOT',
              published: true
            };

            self.rootNode = tree.parse($scope.project.directoryStructure);


            if (self.opendir) {
              self.selectNode(self.opendir);
            } else {
              self.selectNode(self.rootNode);
            }

            $scope.$apply();
          });

        // default sort is by date ascending...
        self.sorting = {
          column: 'date',
          ascending: true
        };

        // self.rootNode = tree.parse($scope.project.directoryStructure);
        self.selectedNode = undefined;
        self.currentNode = undefined;
        self.currentPath = undefined;

        self.allChecked = false;
        self.checkedDirs = [];
        self.checkedFiles = [];
        self.lastChecked = {fileId: undefined, directoryID: undefined};

        self.currentFiles = [];
        self.currentDirs = [];
        self.customSorter = {};

        self.batchMenuEnabled = false;

        self.infoPanel = {
          open: false,
          type: 'None',
          data: undefined,
          toggle: function() {
            self.infoPanel.open = !self.infoPanel.open;
          },
          close: function() {
            self.infoPanel.open = false;
          },
          reset: function() {
            //self.infoPanel.enabled = false;
            //self.infoPanel.open = false;
            self.infoPanel.type = 'None';
            self.infoPanel.data = undefined;
            self.infoPanel.link = undefined;
          },
          setData: function() {
            self.infoPanel.reset();
            // check to see if there is a single lastChecked item set first...
            if (self.lastChecked) {
              if (self.lastChecked.fileId) {
                self.infoPanel.type = 'File';
                var file = _.find(self.currentFiles, function(o) { return o._id.toString() === self.lastChecked.fileId; });
                self.infoPanel.data = file ? file : undefined;
                self.infoPanel.link = window.location.protocol + '//' + window.location.host + '/api/document/'+ file._id+'/fetch';
              } else if (self.lastChecked.directoryID) {
                self.infoPanel.type = 'Directory';
                var node =_.find(self.currentDirs, function(o) { return o.model.id === self.lastChecked.directoryID; });
                self.infoPanel.data = node ? node.model : undefined;
              }
            } else {
              if (_.size(self.checkedDirs) + _.size(self.checkedFiles) > 1) {
                self.infoPanel.type = 'Multi';
                self.infoPanel.data = {
                  checkedFiles: _.size(self.checkedFiles),
                  checkedDirs: _.size(self.checkedDirs),
                  totalFiles: _.size(self.currentFiles),
                  totalDirs: _.size(self.currentDirs)
                }; // what to show here?
              }
            }
          }
        };

        self.sortBy = function(column) {
          //is this the current column?
          if (self.sorting.column.toLowerCase() === column.toLowerCase()){
            //so we reverse the order...
            self.sorting.ascending = !self.sorting.ascending;
          } else {
            // changing column, set to ascending...
            self.sorting.column = column.toLowerCase();
            self.sorting.ascending = true;
          }
          self.applySort();
        };

        self.applySort = function() {
          var direction = self.sorting.ascending ? 1 : -1;
          var collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
          if (self.sorting.column === 'name') {
            self.currentFiles.sort(function (d1, d2) {
              var v = collator.compare(d1.displayName, d2.displayName);
              return v * direction;
            });
            self.currentDirs.sort(function (d1, d2) {
              var v = collator.compare(d1.model.name, d2.model.name);
              return v * direction;
            });
          } else if (self.sorting.column === 'date') {
            self.currentFiles.sort(function(doc1, doc2){
              /*
               Sort by date but account for the case the display value is like June 2017.  We want to group all
               June 2017 docs before any like 2017-01-01.
               */
              var d1 = doc1.documentDate ? {d: moment(doc1.documentDate), my: doc1.documentDateDisplayMnYr} : undefined;
              var d2 = doc2.documentDate ? {d: moment(doc2.documentDate), my: doc2.documentDateDisplayMnYr} : undefined;
              if (d1 && d2 && d1.d.isSame(d2.d,'month')) {
                if (d1.my && d2.my) {
                  return (d1.d.valueOf() - d2.d.valueOf()) * direction;
                } else if (d1.my) {
                  return -1 * direction;
                } else if (d2.my) {
                  return 1 * direction;
                }
              }
              d1 = d1 ? d1.d.valueOf() : 0;
              d2 = d2 ? d2.d.valueOf() : 0;
              return (d1 - d2) * direction;
            });
          } else if (self.sorting.column === 'pub') {
            self.currentFiles.sort(function(doc1, doc2){
              var d1 = doc1.isPublished ? 1 : 0;
              var d2 = doc2.isPublished ? 1 : 0;
              return (d1 - d2) * direction;
            });
          } else if (self.sorting.column === 'custom') {
            self.currentFiles.sort(function(doc1, doc2){
              return (doc1.order - doc2.order);
            });
            self.currentDirs.sort(function(doc1, doc2){
              var f1 = doc1.model.folderObj, f2 = doc2.model.folderObj;
              if (f1 && f2) {
                return (f1.order - f2.order);
              }
              return 0;
            });
          }
        };

        self.checkAll = function() {
          _.each(self.currentDirs, function(o) { o.selected = self.allChecked; });
          _.each(self.currentFiles, function(o) { o.selected = self.allChecked; });

          var doc;
          if (self.allChecked) {
            doc = _.last(self.currentFiles) || _.last(self.currentDirs);
          }

          self.syncCheckedItems(doc);
        };

        self.checkFile = function(doc) {
          // ADD/remove to the selected file list...
          self.syncCheckedItems(doc);
        };
        self.selectFile = function(doc) {
          // selected a file, make it the only item selected...
          var checked = doc.selected;
          _.each(self.currentDirs, function(o) { o.selected = false; });
          _.each(self.currentFiles, function(o) { o.selected = false; });
          doc.selected = !checked;
          self.syncCheckedItems(doc);
        };

        self.dblClick = function(doc){
          /*
          If user can not read the document (BG: I'm not sure this is possible) then show an alert to say
          "You can not read this document" (BG: someone needs to review the text)
          Else (user can read file)
            If the doc is a pdf then open it with the pdf viewer
            Else show a confirmation dialog to offer the user can download the file.
              If user selects yes then download the file.
              Else no op
           */
          if(!doc.userCan.read) {
            AlertService.success('You can not have access to read this document.', 4000);
            return;
          }
          if(doc.internalMime === 'application/pdf') {
            downLoadFile(doc);
            return;
          }
          // $filter bytes is filterBytes in documents.client.controllers.js
          var size = $filter('bytes')(doc.internalSize, 2);
          var msg = 'Confirm download of: ' + doc.displayName + ' (' + size + ')';

          var scope = {
            titleText: doc.displayName,
            confirmText: msg,
            confirmItems: undefined,
            okText: 'OK',
            cancelText: 'Cancel',
            onOk: downLoadFile,
            onCancel: cancelDownload,
            okArgs: doc
          };
          ConfirmService.confirmDialog(scope);
          return;

          function downLoadFile(doc) {
            var pdfURL = window.location.protocol + "//" + window.location.host + "/api/document/" + doc._id + "/fetch";
            window.open(pdfURL, "_blank");
            return Promise.resolve(true);
          }
          function cancelDownload() {
            return Promise.resolve();
          }
        };

        self.checkDir = function(doc) {
          self.syncCheckedItems(doc);
        };
        self.selectDir = function(doc) {
          // selected a dir, make it the only item selected...
          var checked = doc.selected;
          _.each(self.currentDirs, function(o) { o.selected = false; });
          _.each(self.currentFiles, function(o) { o.selected = false; });
          doc.selected = !checked;
          self.syncCheckedItems(doc);
        };
        self.openDir = function(doc) {
          //double clicked a dir, open it up!
          self.selectNode(doc.model.id);
        };

        self.selectNode = function (nodeId) {
          self.busy = true;
          var theNode = self.rootNode.first(function (n) {
            return n.model.id === nodeId;
          });
          if (!theNode) {
            theNode = self.rootNode;
          }

          self.currentNode = theNode; // this is the current Directory in the bread crumb basically...
          self.folderURL = window.location.protocol + "//" + window.location.host + "/p/" + $scope.project.code + "/docs?folder=" + self.currentNode.model.id;
          self.currentFiles = [];
          self.currentDirs = [];

          var pathArray = theNode.getPath();
          _.each(pathArray, function (elem) {
            if (elem.model.id > 1) { //bail the root node cus we don't need to attatch the folderObj to it
              if (!elem.model.hasOwnProperty('folderObj')) { //trying to reduce the amount of API calls only by checking if node model does not have folderObj
                FolderModel.lookup($scope.project._id, elem.model.id)
                  .then(function (folder) {
                    elem.model.folderObj = folder;
                  });
              }
            }
          });
          self.currentPath = pathArray || [];

          // path is published IFF all nodes are not unpublished.  This find returns first unpublished element.
          self.currentPathIsPublished = (undefined === _.find(self.currentPath, function(p) { return ! p.model.published; }));
          var warning = "Warning. You will need to publish all parent folders to fully publish these document(s).";
          self.currentPathIsPublishedWarning = self.currentPathIsPublished ? null : warning;

          DocumentMgrService.getDirectoryDocuments($scope.project, self.currentNode.model.id)
            .then(
              function (result) {
                self.currentFiles = _.map(result.data, function(f) {
                  f.link = window.location.protocol + '//' + window.location.host + '/api/document/'+ f._id+'/fetch';
                  if (_.isEmpty(f.dateUploaded) && !_.isEmpty(f.oldData)) {
                    var od = JSON.parse(f.oldData);
                    try {
                      f.dateUploaded = moment(od.WHEN_CREATED, "MM/DD/YYYY HH:mm").toDate();
                    } catch(ex) {
                      // swallow error
                    }
                  }
                  return _.extend(f,{selected:  (_.find(self.checkedFiles, function(d) { return d._id.toString() === f._id.toString(); }) !== undefined), type: 'File'});
                });

                self.currentDirs = _.map(self.currentNode.children, function (n) {
                  return _.extend(n,{selected: (_.find(self.checkedDirs, function(d) { return d.model.id === n.model.id; }) !== undefined), type: 'Directory'});
                });

                if (self.currentNode.model && self.currentNode.model.folderObj) {
                  var sortField = self.currentNode.model.folderObj.defaultSortField || 'date';
                  var sortDirection = self.currentNode.model.folderObj.defaultSortDirection || 'desc';
                  self.sorting.column = sortField;
                  self.sorting.ascending = sortDirection === 'asc';
                }

                // since we loaded this, make it the selected node
                self.selectedNode = self.currentNode;

                // update the custom sorted ready for it to be opened
                self.customSorter.documents = self.currentFiles;
                self.customSorter.folders = self.currentDirs;
                self.customSorter.sorting = self.sorting;

                // see what is currently checked
                self.syncCheckedItems();
                self.busy = false;
              },
              function (error) {
                $log.error('getDirectoryDocuments error: ', JSON.stringify(error));
                self.busy = false;
              }
            ).then(function () {
            // Go through each of the currently available folders in view, and attach the object
            // to the model dynamically so that the permissions directive will work by using the
            // correct x-object=folderObject instead of a doc.
              return FolderModel.lookupForProjectIn($scope.project._id, self.currentNode.model.id)
                .then(function (folder) {
                  _.each(folder, function (fs) {
                    // We do breadth-first because we like to talk to our neighbours before moving
                    // onto the next level (where we bail for performance reasons).
                    theNode.walk({strategy: 'breadth'}, function (n) {
                      if (n.model.id === fs.directoryID) {
                        n.model.folderObj = fs;
                        return false;
                      }
                    });
                  });
                  $scope.$apply();
                });
            })
            .then(function() {
            // everything is ready.  In particular the directoryStructure models have the most current folderObj
            // so we can perform custom sort if needed.
              self.applySort();
            });
        };

        self.defaultSortOrderChanged = function() {
          self.selectNode(self.currentNode.model.id);
        };

        self.syncCheckedItems = function(doc) {
          self.checkedDirs = _.filter(self.currentDirs, function(o) { return o.selected; }) || [];
          self.checkedFiles = _.filter(self.currentFiles, function(o) { return o.selected; }) || [];
          // any kind of contexts that depend on what is selected needs to be done here too...
          self.lastChecked = undefined;
          if (doc && doc.selected && (_.size(self.checkedDirs) + _.size(self.checkedFiles) === 1)){
            if (doc.model) {
              self.lastChecked = { directoryID: doc.model.id, fileId: undefined };
            } else {
              self.lastChecked = { directoryID: undefined, fileId: doc._id.toString() };
            }
          }
          if (!doc && (_.size(self.checkedDirs) + _.size(self.checkedFiles) === 1)){
            // if no doc passed in, but there is a single selected item, make it lastSelected
            // most probable case is a selectNode after a context menu operation...
            if (_.size(self.checkedDirs) === 1) {
              self.lastChecked = { directoryID: self.checkedDirs[0].model.id, fileId: undefined };
            } else {
              self.lastChecked = { directoryID: undefined, fileId: self.checkedFiles[0]._id.toString() };
            }
          }
          self.infoPanel.setData();
          self.deleteSelected.setContext();
          self.publishSelected.setContext();
          self.moveSelected.setContext();

          // in the batch menu, we have some folder management and publish/unpublish of files.
          // so user needs to be able to manage folders, or have some selected files they can pub/unpub
          self.batchMenuEnabled = ($scope.project.userCan.manageFolders && _.size(self.checkedDirs) > 0) || _.size(self.publishSelected.publishableFiles) > 0 || _.size(self.publishSelected.unpublishableFiles) > 0;
        };

        self.deleteDocument = function(documentID) {
          var collections = null;
          return Document.lookup(documentID)
            .then(function(doc) {
              collections = doc.collections;
              return Document.getProjectDocumentVersions(doc._id);
            })
            .then(function(docs) {
              // Are there any prior versions?  If so, make them the latest and then delete
              // otherwise delete
              if (docs.length > 0) {
                return Document.makeLatestVersion(docs[docs.length-1]._id);
              } else {
                return null;
              }
            })
            .then(function() {
              // MEM-597: If there are there any collections associated with this document,
              // then delete the collection document reference in the collections as well.
              var promises = _.union(_.map(collections, function(c) {
                return CollectionModel.removeOtherDocument(c._id, documentID);
              }), _.map(collections, function(c) {
                return CollectionModel.removeMainDocument(c._id, documentID);
              }));
              return Promise.all(promises);
            })
            .then(function () {
              // Delete the document from the system.
              return Document.deleteDocument(documentID);
            })
            .catch (function(/* err */) {
              AlertService.error('The document could not be deleted.', 4000);
            });
        };

        self.deleteSelected = {
          confirmItems: [],
          setContext: function() {
            self.deleteSelected.confirmItems = [];
            _.each(self.checkedDirs, function(o) {
              if ($scope.project.userCan.manageFolders) {
                self.deleteSelected.confirmItems.push(o.model.name);
              }
            });
            _.each(self.checkedFiles, function(o) {
              if (o.userCan.delete) {
                self.deleteSelected.confirmItems.push(o.displayName);
              }
            });
          }
        };

        // callback invoked by delete directive once user confirms delete
        self.deleteFilesAndDirs = function(deletableFolders, deletableFiles) {
          self.busy = true;

          var dirPromises = _.map(deletableFolders, function(d) {
            return DocumentMgrService.removeDirectory($scope.project, d);
          });

          var filePromises = _.map(deletableFiles, function(f) {
            return self.deleteDocument(f._id);
          });

          var directoryStructure;
          return Promise.all(dirPromises)
            .then(function(result) {
              if (!_.isEmpty(result)) {
                var last = _.last(result);
                directoryStructure = last.data;
              }
              return Promise.all(filePromises);
            })
            .then(function(/* result */) {
              if (directoryStructure) {
                $scope.project.directoryStructure = directoryStructure;
                $scope.$broadcast('documentMgrRefreshNode', { directoryStructure: directoryStructure });
              }
              self.selectNode(self.currentNode.model.id);
              self.busy = false;
              AlertService.success('The selected items were deleted.', 4000);
            }, function(/* err */) {
              self.busy = false;
              AlertService.error('The selected items could not be deleted.', 4000);
            });
        };

        self.publishFilesAndDirs = function(files, dirs) {
          self.busy = true;
          var filePromises = _.map(files, function(f) {
            return Document.publish(f);
          });
          var dirPromises = _.map(dirs, function(d) {
            return ProjectModel.publishDirectory($scope.project, d.model.id);
          });
          var directoryStructure;

          return Promise.all(dirPromises)
            .then(function(result) {
              if (!_.isEmpty(result)) {
                self.selectNode(self.currentNode.model.id);
                AlertService.success('The selected folder' + (dirPromises.length > 1 ? 's were' : ' was') + ' successfully published.', 4000);
                directoryStructure = _.last(result);
              }
            }, function(/* err */) {
              self.busy = false;
              var msg = '';
              if (dirPromises.length > 1) {
                msg = 'Some of the selected folders could not be published.';
              } else {
                msg = 'The selected folder could not be published.';
              }
              AlertService.error(msg, 4000);
            })
            .then(function() {
              return Promise.all(filePromises);
            })
            .then(function(result) {
              if (directoryStructure) {
                $scope.project.directoryStructure = directoryStructure;
                $scope.$broadcast('documentMgrRefreshNode', { directoryStructure: directoryStructure });
              }
              if (!_.isEmpty(filePromises)) {
                var published = _.map(result, function(o) { if (o.isPublished) {return o.displayName;} });
                self.selectNode(self.currentNode.model.id);
                AlertService.success(_.size(published) + ' of ' + _.size(files) + ' file(s) successfully published.', 4000);
              }
            }, function(/* err */) {
              self.busy = false;
              var msg = '';
              if (filePromises.length > 1) {
                msg = 'Some of the selected files could not be published.';
              } else {
                msg = 'The selected file could not be published.';
              }
              AlertService.error(msg, 4000);
            });
        };

        self.unpublishFilesAndDirs = function(files, dirs) {
          self.busy = true;
          var filePromises = _.map(files, function(f) {
            return Document.unpublish(f);
          });
          var dirPromises = _.map(dirs, function(d) {
            return ProjectModel.unpublishDirectory($scope.project, d.model.id);
          });
          var directoryStructure;

          return Promise.all(dirPromises)
            .then(function(result) {
              if (!_.isEmpty(result)) {
                self.selectNode(self.currentNode.model.id);
                AlertService.success('The selected folder' + (dirPromises.length > 1 ? 's were' : ' was') + ' successfully unpublished.', 4000);
                directoryStructure = _.last(result);
              }
            }, function(docs) {
              var msg = 'The selected folder' + (dirPromises.length > 1 ? 's' : '') + ' could not be unpublished';
              var time = 4000;
              if (docs.message && docs.message[0] && docs.message[0].displayName) {
                msg += ' as ' + (dirPromises.length > 1 ? 'they contain' : 'it contains') + ' published documents.';
                msg += ' Please unpublish each document and attempt your action again.';
                time = 7000;
              } else {
                msg += '.';
              }
              self.busy = false;
              AlertService.error(msg, time);
            })
            .then(function() {
              return Promise.all(filePromises);
            })
            .then(function(result) {
              if (directoryStructure) {
                $scope.project.directoryStructure = directoryStructure;
                $scope.$broadcast('documentMgrRefreshNode', { directoryStructure: directoryStructure });
              }
              if (!_.isEmpty(filePromises)) {
                var unpublished = _.map(result, function(o) { if (!o.isPublished) {return o.displayName;} });
                self.selectNode(self.currentNode.model.id);
                AlertService.success(_.size(unpublished) + ' of ' + _.size(files) + ' file(s) successfully unpublished.', 4000);
              }
            }, function(/* err */) {
              self.busy = false;
              var msg = '';
              if (filePromises.length > 1) {
                msg = 'Some of the selected files could not be unpublished.';
              } else {
                msg = 'The selected file could not be unpublished.';
              }
              AlertService.error(msg, 4000);
            });
        };

        self.publishFolder = function(folder) {
          return self.publishFilesAndDirs([], [folder]);
        };

        self.unpublishFolder = function(folder) {
          return self.unpublishFilesAndDirs([], [folder]);
        };

        self.publishFile = function(file) {
          return self.publishFilesAndDirs([file], []);
        };

        self.unpublishFile = function(file) {
          return self.unpublishFilesAndDirs([file],[]);
        };

        self.publishSelected = {
          publish: function() {
            return self.publishFilesAndDirs(self.publishSelected.publishableFiles, self.publishSelected.publishableDirs);
          },
          unpublish: function() {
            return self.unpublishFilesAndDirs(self.publishSelected.unpublishableFiles, self.publishSelected.unpublishableDirs);
          },
          cancel: undefined,
          confirmPublishItems: [],
          confirmUnpublishItems: [],
          publishableFiles: [],
          unpublishableFiles: [],
          publishableDirs: [],
          unpublishableDirs: [],
          setContext: function() {
            self.publishSelected.confirmPublishItems = [];
            self.publishSelected.confirmUnpublishItems = [];
            self.publishSelected.publishableFiles = [];
            self.publishSelected.unpublishableFiles = [];
            self.publishSelected.publishableDirs = [];
            self.publishSelected.unpublishableDirs = [];

            // documents/files
            _.each(self.checkedFiles, function(o) {
              if (o.userCan.publish && !o.isPublished) {
                self.publishSelected.publishableFiles.push(o);
                self.publishSelected.confirmPublishItems.push(o.displayName);
              }
              if (o.userCan.unPublish && o.isPublished) {
                self.publishSelected.unpublishableFiles.push(o);
                self.publishSelected.confirmUnpublishItems.push(o.displayName);
              }
            });

            // folders
            if ($scope.project.userCan.manageFolders) {
              _.each(self.checkedDirs, function(o) {
                if (o.model.published) {
                  self.publishSelected.unpublishableDirs.push(o);
                  self.publishSelected.confirmUnpublishItems.push(o.model.name);
                } else {
                  self.publishSelected.publishableDirs.push(o);
                  self.publishSelected.confirmPublishItems.push(o.model.name);
                }
              });
            }
          }
        };

        self.moveSelected = {
          titleText: 'Move File(s)',
          okText: 'Yes',
          cancelText: 'No',
          ok: function(destination) {
            if (!destination) {
              return Promise.reject('Destination required for moving files and folders.');
            } else {
              //Check destination directory for folders of identical name to selected folder(s).
              var repeat = _.find(self.moveSelected.moveableFolders, function(srcFolder) {
                return _.find(destination.children, function(destFolder) {
                  return destFolder.model.name === srcFolder.model.name;
                });
              });
              //If repeat name found, throw error. Otherwise, continue with move.
              if (repeat) {
                AlertService.error('Folder name ' + repeat.model.name + ' already exists in ' + destination.model.name, 4000);
              } else {
                var dirs = _.size(self.checkedDirs);
                var files = _.size(self.checkedFiles);
                if (dirs === 0 && files === 0) {
                  return Promise.resolve();
                } else {
                  self.busy = true;

                  var filePromises = _.map(self.moveSelected.moveableFiles, function (f) {
                    f.directoryID = destination.model.id;
                    return Document.save(f);
                  });
                  var directoryStructure;
                  // promise to move files and folders
                  return new Promise(function (resolve, reject) {
                    var promise = Promise.resolve(null);
                    var count = _.size(self.moveSelected.moveableFolders);
                    if (count > 0) { // we have this counter to check if there is only files that need to be moved i.e execute only if the folder array size > 0
                      //loop to move files sequentially
                      self.moveSelected.moveableFolders.forEach(function (value) {
                        promise = promise.then(function () {
                          return DocumentMgrService.moveDirectory($scope.project, value, destination);
                        })
                          .then(function (newValue) {
                            count--;
                            if (count === 0) {
                              resolve(newValue);
                            }
                          });
                      });
                      promise = promise.catch(reject); //finish promise chain with an error handler
                    }
                    else {
                      resolve(null); //if no folders
                    }
                  })
                    .then(function (result) {
                      if (!_.isEmpty(result)) {
                        directoryStructure = result.data;
                      }
                      return Promise.all(filePromises);
                    })
                    .then(function (/* result */) {
                      if (directoryStructure) {
                        $scope.project.directoryStructure = directoryStructure;
                        $scope.$broadcast('documentMgrRefreshNode', { directoryStructure: directoryStructure });
                      }
                      self.selectNode(destination.model.id);
                      AlertService.success('The selected items were moved.', 4000);
                    }).catch(function (/* err */) {
                      self.busy = false;
                      AlertService.error('The selected items could not be moved.', 4000);
                    });
                }

              }
            }
          },
          cancel: undefined,
          confirmText:  'Are you sure you want to move the selected item(s)?',
          confirmItems: [],
          moveableFolders: [],
          moveableFiles: [],
          setContext: function() {
            self.moveSelected.confirmItems = [];
            self.moveSelected.titleText = 'Move selected';
            self.moveSelected.confirmText = 'Are you sure you want to move the following the selected item(s)?';
            var dirs = _.size(self.checkedDirs);
            var files = _.size(self.checkedFiles);
            if (dirs > 0 && files > 0) {
              self.moveSelected.titleText = 'Move Folder(s) and File(s)';
              self.moveSelected.confirmText = 'Are you sure you want to move the following ('+ dirs +') folders and ('+ files +') files?';
            } else if (dirs > 0) {
              self.moveSelected.titleText = 'Move Folder(s)';
              self.moveSelected.confirmText = 'Are you sure you want to move the following ('+ dirs +') selected folders?';
            } else if (files > 0) {
              self.moveSelected.titleText = 'Move File(s)';
              self.moveSelected.confirmText = 'Are you sure you want to move the following ('+ files +') selected files?';
            }

            self.moveSelected.confirmItems = [];
            self.moveSelected.moveableFolders = [];
            self.moveSelected.moveableFiles = [];

            _.each(self.checkedDirs, function(o) {
              if ($scope.project.userCan.manageFolders) {
                self.moveSelected.confirmItems.push(o.model.name);
                self.moveSelected.moveableFolders.push(o);
              }
            });
            _.each(self.checkedFiles, function(o) {
              if (o.userCan.write) {
                var name = o.displayName;
                self.moveSelected.confirmItems.push(name);
                self.moveSelected.moveableFiles.push(o);
              }
            });

          }
        };

        self.onPermissionsUpdate = function() {
          self.selectNode(self.currentNode.model.id);
        };

        self.onDocumentUpdate = function(/* value */) {
          // should refresh the table and the info panel...
          self.selectNode(self.currentNode.model.id);
        };

        self.updateCollections = function(collections, documents) {
          var promises = [];
          if (_.isArray(documents)) {
            // Add the documents to the selected collections
            _.each(documents, function(d) {
              _.each(collections, function(c) {
                // This is have no effect if the document is already in the collection.
                promises.push(CollectionModel.addOtherDocument(c._id, d._id));
              });
            });
            return Promise.all(promises).then(function() {
              AlertService.success('The document' + (documents.length > 1 ? 's were' : ' was') + ' successfully added to the collection' + (collections.length > 1 ? 's.' : '.'), 4000);
            }, function(err) {
              AlertService.error('The document' + (documents.length > 1 ? 's were' : ' was') + ' not added to the collection' + (collections.length > 1 ? 's: ' : ': ') + err.message, 4000);
            });
          } else {
            // Update (add/remove) the collections for this document
            var original = documents.collections;

            // Find added collections
            var added = _.filter(collections, function(c) {
              return !_.find(original, function(o) { return o._id === c._id; });
            });

            // Find removed collections
            var removed = _.filter(original, function(o) {
              return !_.find(collections, function(c) { return o._id === c._id; });
            });
            // Updating collections:
            // Addition - only other documents
            // Removal - check main and other documents
            promises = _.union(_.map(added, function(c) {
              return CollectionModel.addOtherDocument(c._id, documents._id);
            }), _.map(removed, function(c) {
              return CollectionModel.removeMainDocument(c._id, documents._id);
            }));
            // EPIC - 1215 Collections (info panel) do not get updated when removed from the document
            // Dealing seperately with removal of documents (associated with the appropriate collections) here
            // because saving documents after removing collections
            // does not take into consideration the fact that the collections could be updated by something else
            //Therefore, we serialize promises such that removal of one document only happens after the removal of another document.
            var chain = _.reduce(removed, function(previousPromise, currentCollectionElement) {
              return previousPromise.then(function() {
                return CollectionModel.removeOtherDocument(currentCollectionElement._id, documents._id);
              });
            }, Promise.resolve());
            promises.push(chain);

            return Promise.all(promises).then(function() {
              AlertService.success('The document\'s collections were successfully updated.', 4000);
            }, function(err) {
              AlertService.error('The document\'s collections were not successfully updated: '+ err.message, 4000);
            });
          }
        };

        $scope.$on('documentMgrRefreshNode', function (event, args) {
          if (args.nodeId) {
            // Refresh the node
            self.selectNode(args.nodeId);
          } else {
            self.rootNode = tree.parse(args.directoryStructure);
            self.selectNode(self.currentNode.model.id);
          }
        });
      },
      controllerAs: 'documentMgr'
    };
  }]);
filterDocumentDate.$inject = ['moment'];
/* @ngInject */
function filterDocumentDate(moment) {
  return function(input, displayFormat) {
    var format = displayFormat ? "MMMM YYYY" : "YYYY-MM-DD";
    var m = moment(input);
    var dstr = m.isValid() ? m.format(format) : "";
    return dstr;
  };
}
