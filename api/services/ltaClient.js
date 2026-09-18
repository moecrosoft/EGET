const { exec } = require('child_process');
const path = require('path');

// Path to project root so python modules resolve correctly
const ROOT_DIR = path.resolve(__dirname, '../../');

/**
 * Executes a tool function defined inside /backend/tools/llm_tools.py
 */
function callPythonTool(functionName, args = []) {
  return new Promise((resolve, reject) => {
    const serializedArgs = JSON.stringify(args);

    const pythonScript = `
import json, sys
from backend.tools import llm_tools

try:
    tool_fn = getattr(llm_tools, '${functionName}')
    args = json.loads('''${serializedArgs}''')
    # invoke the underlying function wrapped by @tool
    res = tool_fn.invoke(args[0]) if len(args) > 0 and isinstance(args[0], dict) else tool_fn.invoke({})
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

    const command = `python3 -c ${JSON.stringify(pythonScript)}`;

    exec(command, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`[Python Error] ${stderr.trim() || error.message}`));
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed && parsed.error) {
          return reject(new Error(parsed.error));
        }
        resolve(parsed);
      } catch (parseErr) {
        reject(new Error(`Failed to parse Python response: ${stdout}`));
      }
    });
  });
}

module.exports = {
  getTrainServiceAlerts: () => callPythonTool('get_train_service_alerts'),
  getRealtimeCrowding: (lineCode) => callPythonTool('get_realtime_crowding', [{ line_code: lineCode }]),
  getCrowdingForecast: (lineCode) => callPythonTool('get_crowding_forecast', [{ line_code: lineCode }]),
  getBusArrival: (busStopCode) => callPythonTool('get_bus_arrival', [{ bus_stop_code: busStopCode }]),
  getWeatherForecast: () => callPythonTool('get_weather_forecast'),
  getRainfall: () => callPythonTool('get_rainfall'),
  getPublicHolidays: () => callPythonTool('get_public_holidays'),
};