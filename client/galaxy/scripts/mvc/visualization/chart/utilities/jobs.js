/** This class handles job submissions to the Galaxy API. */
import Utils from "utils/utils";

/** Time to wait before refreshing to check if job has completed */
var WAITTIME = 1000;

/** build job dictionary */
var requestCharts = function(chart, module) {
    var settings_string = "";
    var columns_string = "";
    var group_index = 0;
    for (var key in chart.settings.attributes) {
        var settings_value = chart.settings.get(key);
        _.each([[" ", "&#32;"], [",", "&#44;"], [":", "&#58;"]], function(pair) {
            settings_value = settings_value.replace(new RegExp(pair[0], "g"), pair[1]);
        });
        settings_string += key + ":" + settings_value + ", ";
    }
    settings_string = settings_string.substring(0, settings_string.length - 2);
    chart.groups.each(function(group) {
        group_index++;
        _.each(group.get("__data_columns"), function(data_columns, name) {
            columns_string += name + "_" + group_index + ":" + (parseInt(group.get(name)) + 1) + ", ";
        });
    });
    columns_string = columns_string.substring(0, columns_string.length - 2);
    return {
        tool_id: "charts",
        inputs: {
            input: {
                id: chart.get("dataset_id"),
                src: "hda"
            },
            module: module,
            columns: columns_string,
            settings: settings_string
        }
    };
};

/** Submit job request to charts tool */
var request = function(chart, parameters, success, error) {
    chart.state("wait", "Requesting job results...");
    if (chart.get("modified")) {
        cleanup(chart);
        chart.set("modified", false);
    }
    var dataset_id_job = chart.get("dataset_id_job");
    if (dataset_id_job != "") {
        wait(chart, success, error);
    } else {
        var chart_id = chart.id;
        var chart_type = chart.get("type");
        var chart_definition = chart.definition;
        chart.state("wait", "Sending job request...");
        Utils.request({
            type: "POST",
            url: Galaxy.root + "api/tools",
            data: parameters,
            success: function(response) {
                if (!response.outputs || response.outputs.length == 0) {
                    chart.state("failed", "Job submission failed. No response.");
                    error && error();
                } else {
                    refreshHdas();
                    var job = response.outputs[0];
                    chart.state(
                        "wait",
                        "Your job has been queued. You may close the browser window. The job will run in the background."
                    );
                    chart.set("dataset_id_job", job.id);
                    chart.save();
                    wait(chart, success, error);
                }
            },
            error: function(response) {
                var message = "";
                if (response && response.message && response.message.data && response.message.data.input) {
                    message = response.message.data.input + ".";
                }
                chart.state(
                    "failed",
                    "This visualization requires the '" +
                        parameters.tool_id +
                        "' tool. Please make sure it is installed. " +
                        message
                );
                error && error();
            }
        });
    }
};

/* Remove previous data when re-running jobs */
var cleanup = function(chart) {
    var self = this;
    var previous = chart.get("dataset_id_job");
    if (previous != "") {
        Utils.request({
            type: "PUT",
            url: Galaxy.root + "api/histories/none/contents/" + previous,
            data: { deleted: true },
            success: function() {
                refreshHdas();
            }
        });
        chart.set("dataset_id_job", "");
    }
};

/** Request job details */
var wait = function(chart, success, error) {
    var self = this;
    Utils.request({
        type: "GET",
        url: Galaxy.root + "api/datasets/" + chart.get("dataset_id_job"),
        data: {},
        success: function(dataset) {
            var ready = false;
            switch (dataset.state) {
                case "ok":
                    chart.state("wait", "Job completed successfully...");
                    success && success(dataset);
                    ready = true;
                    break;
                case "error":
                    chart.state("failed", "Job has failed. Please check the history for details.");
                    error && error(dataset);
                    ready = true;
                    break;
                case "running":
                    chart.state(
                        "wait",
                        "Your job is running. You may close the browser window. The job will continue in the background."
                    );
            }
            !ready &&
                setTimeout(function() {
                    wait(chart, success, error);
                }, WAITTIME);
        }
    });
};

/** Refresh history panel */
var refreshHdas = function() {
    Galaxy && Galaxy.currHistoryPanel && Galaxy.currHistoryPanel.refreshContents();
};

export default { request: request, requestCharts: requestCharts };
