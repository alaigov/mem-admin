'use strict';
// =========================================================================
//
// Controller for vcs
//
// =========================================================================
var path = require('path');
var _ = require ('lodash');
var DBModel = require (path.resolve('./modules/core/server/controllers/core.dbmodel.controller'));
var EmailController = require (path.resolve('./modules/core/server/controllers/email.server.controller'));
var InvitationController = require (path.resolve('./modules/invitations/server/controllers/invitation.controller'));


module.exports = DBModel.extend ({
  name: 'Communication',
  plural: 'communications',
  sort: {dateUpdated:-1},
  populate: 'artifacts artifacts.name artifacts.version artifacts.versionNumber',


  preprocessAdd : function (model) {
    var self = this;
    return new Promise (function (resolve, reject) {


      if (model.type === 'Invitation') {
        // communications are for updates and invitations at this point.
        // invitations have different defaults than udpates - which are what are the stored defaults
        model.read = ['sysadmin', 'team', 'project-lead'];
        model.write = ['sysadmin', 'team', 'project-lead'];
        model.delete = ['sysadmin', 'team', 'project-lead'];
      }

      model.code = model.name.toLowerCase();
      model.code = model.code.replace(/\W/g, '-');
      model.code = model.code.replace(/^-+|-+(?=-|$)/g, '');
      //
      // this does the work of that and returns a promise
      //
      self.guaranteeUniqueCode(model.code)
        .then(function (/* code */) {
          return model;
        }).then(resolve, reject);
    });
  },

  getForProject: function (id) {
    return this.list({project: id});
  },

  getForGroup: function (id) {
    return this.list({group: {$in: [id] }});
  },

  deliver: function(model) {
    var emailList = _.filter(model.recipients, function(o) { return o.viaEmail; });
    var recipients = [];
    _.forEach(emailList, function(o) {
      recipients.push({name: o.displayName, address: o.email});
    });

    if (model.personalized) {
      return EmailController.sendEach(model.subject, '', model.content, recipients).
        then(function(/* res */) {
          model.status = 'Sent';
          model.dateSent = Date.now();
          return model.save();
        }).catch(function(/* err */) {
          // swallow error
        });
    } else {
      return EmailController.sendAll(model.subject, '', model.content, [], [], recipients).
        then(function(/* res */) {
          model.status = 'Sent';
          model.dateSent = Date.now();
          return model.save();
        }).catch(function(/* err */) {
          // swallow error
        });
    }
  },

  deliverInvitation: function(model) {
    var emailList = _.filter(model.recipients, function(o) { return o.viaEmail; });
    var userIds = _.map(emailList, 'userId');
    var recipients = [];
    _.forEach(emailList, function(o) {
      recipients.push({name: o.displayName, address: o.email});
    });

    var invitationController = new InvitationController(this.opts);

    // this should always be personalized...
    if (model.personalized) {
      // get the invitations, or create a new ones...
      // we need to add that to each email...
      return invitationController.findOrCreate(userIds)
        .then(function(invites) {
          var invitationData = [];
          _.forEach(emailList, function(r) {
            var invite = _.find(invites, function(i) { return i.user.toString() === r.userId; });
            invitationData.push({ to: {name: r.displayName, address: r.email}, invitation: invite });
          });
          return EmailController.sendInvitations(model.subject, '', model.content, invitationData);
        })
        .then(function(/* res */) {
          model.status = 'Sent';
          model.dateSent = Date.now();
          return model.save();
        }).catch(function(/* err */) {
          // swallow error
        });
    }
  }
});
