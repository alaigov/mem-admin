/* global _ */

'use strict';

angular
	.module('core')
	.constant('_', window._)
	.constant('d3', window.d3)
	.constant('google', window.google)
	.constant('moment', window.moment)
	.constant('PROVINCES', 
		{
			'ab': 'Alberta',
			'bc': 'British Columbia',
			'mb': 'Manitoba',
			'nb': 'New Brunswick',
			'nl': 'Newfoundland and Labrador',
			'ns': 'Nova Scotia',
			'on': 'Ontario',
			'pe': 'Prince Edward Island',
			'qc': 'Quebec',
			'sk': 'Saskatchewan',
			'nt': 'Northwest Territories',
			'nu': 'Nunavut',
			'yt': 'Yukon'
		}
	)
	.constant('REGIONS', 
		{
			'cariboo': 'Cariboo',
			'kootenay': 'Kootenay',
			'lowermainland': 'Lower Mainland',
			'thompsonokanagan': 'Thompson Okanagan',
			'omnieca': 'Omineca',
			'peace': 'Peace',
			'skeena': 'Skeena',
			'vancouverisland': 'Vancouver Island'
		}
	)
	.constant('COMPANY_TYPES',
		{
			'private': 'Privately Owned',
			'public': 'Publically Traded',
		}
	)
	.constant('TASK_STATUS',
		[
			'Not Required',
			'Not Started',
			'In Progress',
			'Complete'
		]
	)
	.constant('VC_ASSESSMENT_CATEGORIES',
		[
			'Environment',
			'Economic',
			'Social',
			'Heritage',
			'Health'
		]
	)
	.constant('PROJECT_TYPES',
		[
			'Mining',
			'Energy',
			'Transportation', 
			'Water Management',
			'Industrial',
			'Waste Management',
			'Waste Disposal',
			'Food Processing',
			'Tourist Destination'
		]
	)
	.constant('COMMENT_REJECT', 
		[
			'Unsuitable Language',
			'Quoting Third Parties',
			'Petitions',
			'Personally Identifying Information'
		]
	)
	.constant('PROJECT_ROLES', 
		[
			{'code':'project:staff','name':'Staff'},
			{'code':'project:wg','name':'Working Group'},
			{'code':'project:proponent','name':'Proponent'}
		]
	)
	.constant('PROJECT_STATUS', 
		{
			'initiated' : 'Initiated',
			'submitted' : 'Submitted',
			'inprogress' : 'In Progress',
			'certified' : 'Certified',
			'decommissioned' : 'Decommissioned'
		}
	)
	.constant('PROJECT_STATUS_PUBLIC', 
		{
			'inprogress' : 'In Progress',
			'certified' : 'Certified',
			'decommissioned' : 'Decommissioned'
		}
	)	
	.value('ProcessCodes', []);
