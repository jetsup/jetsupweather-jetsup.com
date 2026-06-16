import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Soup from 'gi://Soup?version=3.0';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LOG_FILE = '/home/george/.local/share/gnome-shell/extensions/jetsupweather@jetsup.com/prefs-debug.log';
const MAX_LOCATIONS = 5;
const _enc = new TextEncoder();

function log(msg) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const line = `[${timestamp}] ${msg}\n`;
    try {
        const file = Gio.File.new_for_path(LOG_FILE);
        const out = file.append_to(Gio.FileCreateFlags.NONE, null);
        out.write(_enc.encode(line), null);
        out.close(null);
    } catch (e) {
        try {
            const f = Gio.File.new_for_path('/tmp/jetsup-prefs-err.txt');
            const o = f.replace(null, false, Gio.FileCreateFlags.NONE, null);
            o.write(_enc.encode(`log error: ${String(e)}\n`), null);
            o.close(null);
        } catch (_) {}
    }
}

function clearLog() {
    try {
        GLib.file_set_contents(LOG_FILE, '');
    } catch (_) {}
}

function makeResultLabel(result) {
    return result.admin1 ? `${result.name}, ${result.admin1}, ${result.country}` : `${result.name}, ${result.country}`;
}

function makeResultData(result) {
    return {
        name: result.name,
        country: result.country,
        country_code: result.country_code || '',
        latitude: result.latitude,
        longitude: result.longitude,
        query: makeResultLabel(result),
    };
}

function makeAutoLabel(data) {
    return `${data.name},${data.country_code}`;
}

export default class JetsupWeatherPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        clearLog();
        log('=== JETSUP PREFS LOADED (fetch version) ===');
        const settings = this.getSettings();
        this._locationRows = [];

        const page = new Adw.PreferencesPage({
            title: 'Weather',
            icon_name: 'weather-clear-symbolic',
        });

        const generalGroup = new Adw.PreferencesGroup({
            title: 'Weather Data',
            description: 'Which weather data to fetch and display',
        });

        const tempRow = new Adw.ComboRow({
            title: 'Temperature Unit',
            model: new Gtk.StringList({ strings: ['Celsius', 'Fahrenheit'] }),
        });
        {
            const idx = settings.get_string('temperature-unit') === 'fahrenheit' ? 1 : 0;
            tempRow.set_selected(idx);
        }
        tempRow.connect('notify::selected', () => {
            settings.set_string('temperature-unit', tempRow.get_selected() === 1 ? 'fahrenheit' : 'celsius');
        });
        settings.connect('changed::temperature-unit', () => {
            tempRow.set_selected(settings.get_string('temperature-unit') === 'fahrenheit' ? 1 : 0);
        });
        generalGroup.add(tempRow);

        const windSpeedRow = new Adw.ComboRow({
            title: 'Wind Speed Unit',
            model: new Gtk.StringList({ strings: ['km/h', 'mph', 'm/s', 'knots'] }),
        });
        {
            const units = ['km/h', 'mph', 'm/s', 'knots'];
            const cur = settings.get_string('wind-speed-unit');
            windSpeedRow.set_selected(Math.max(0, units.indexOf(cur)));
        }
        windSpeedRow.connect('notify::selected', () => {
            const units = ['km/h', 'mph', 'm/s', 'knots'];
            settings.set_string('wind-speed-unit', units[windSpeedRow.get_selected()]);
        });
        settings.connect('changed::wind-speed-unit', () => {
            const units = ['km/h', 'mph', 'm/s', 'knots'];
            windSpeedRow.set_selected(Math.max(0, units.indexOf(settings.get_string('wind-speed-unit'))));
        });
        generalGroup.add(windSpeedRow);

        const forecastRow = Adw.SpinRow.new_with_range(1, 7, 1);
        forecastRow.set_title('Forecast Days');
        forecastRow.set_subtitle('Number of forecast days to display');
        const refreshSettings = () => {
            forecastRow.set_value(settings.get_int('forecast-days'));
        };
        refreshSettings();
        forecastRow.connect('changed', () => {
            settings.set_int('forecast-days', forecastRow.get_value());
        });
        settings.connect('changed::forecast-days', refreshSettings);
        generalGroup.add(forecastRow);

        const refreshRow = Adw.SpinRow.new_with_range(10, 300, 5);
        refreshRow.set_title('Refresh Interval');
        refreshRow.set_subtitle('Seconds between weather data refreshes');
        const refreshSettings2 = () => {
            refreshRow.set_value(settings.get_int('refresh-interval'));
        };
        refreshSettings2();
        refreshRow.connect('changed', () => {
            settings.set_int('refresh-interval', refreshRow.get_value());
        });
        settings.connect('changed::refresh-interval', refreshSettings2);
        generalGroup.add(refreshRow);

        page.add(generalGroup);

        const locationGroup = new Adw.PreferencesGroup({
            title: 'Locations',
            description: `Add up to ${MAX_LOCATIONS} locations to track weather for`,
        });

        const addButton = new Gtk.Button({
            label: 'Add Location',
            halign: Gtk.Align.START,
            margin_top: 8,
            margin_bottom: 8,
        });
        locationGroup.set_header_suffix(addButton);

        const getLocations = () => {
            try {
                return JSON.parse(settings.get_string('locations'));
            } catch {
                return [];
            }
        };

        const saveLocations = (locations) => {
            settings.set_string('locations', JSON.stringify(locations));
        };

        const reindexRows = () => {
            this._locationRows.forEach((row, idx) => {
                row._index = idx;
            });
        };

        const addLocationRow = (location, index) => {
            const row = new Adw.PreferencesRow();
            const mainBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
            });

            const topRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                margin_top: 4,
                margin_bottom: 4,
                margin_start: 8,
                margin_end: 8,
            });

            const nameEntry = new Gtk.Entry({
                placeholder_text: 'Label (e.g. Home)',
                text: location.name || '',
                hexpand: false,
                width_chars: 10,
            });

            const searchEntry = new Gtk.SearchEntry({
                placeholder_text: 'Search city...',
                text: location.query || '',
                hexpand: true,
            });

            const removeBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
            });

            topRow.append(nameEntry);
            topRow.append(searchEntry);
            topRow.append(removeBtn);

            const resultBox = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.SINGLE,
            });
            resultBox.set_visible(false);

            mainBox.append(topRow);
            mainBox.append(resultBox);
            row.set_child(mainBox);
            row._index = index;

            let debounceId = 0;
            let ignoreNextChange = false;

            const clearResults = () => {
                let child = resultBox.get_first_child();
                while (child) {
                    const next = child.get_next_sibling();
                    resultBox.remove(child);
                    child = next;
                }
            };

            const showResults = (show) => {
                resultBox.set_visible(show);
            };

            searchEntry.connect('notify::text', () => {
                if (ignoreNextChange) {
                    ignoreNextChange = false;
                    return;
                }

                if (debounceId) {
                    GLib.source_remove(debounceId);
                    debounceId = 0;
                }

                const text = searchEntry.text.trim();
                log(`text changed: "${text}" (len=${text.length})`);
                if (text.length < 2) {
                    showResults(false);
                    return;
                }

                debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                    debounceId = 0;
                    log(`search triggered for: "${text}"`);

                    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=8&language=en&format=json`;
                    const msg = Soup.Message.new('GET', url);
                    const session = new Soup.Session({ timeout: 5 });

                    log(`fetching: ${url}`);
                    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
                        try {
                            const bytes = s.send_and_read_finish(res);
                            const status = msg.get_status();
                            log(`response status: ${status}`);

                            if (status !== 200) {
                                showResults(false);
                                return;
                            }

                            const json = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                            const results = json.results || [];
                            log(`got ${results.length} results`);

                            clearResults();

                            for (const r of results) {
                                const label = new Gtk.Label({
                                    label: makeResultLabel(r),
                                    xalign: 0,
                                    margin_top: 4,
                                    margin_bottom: 4,
                                    margin_start: 8,
                                    margin_end: 8,
                                    ellipsize: 3,
                                });

                                const listRow = new Gtk.ListBoxRow();
                                listRow.set_child(label);
                                listRow.focusable = false;
                                listRow._data = makeResultData(r);
                                resultBox.append(listRow);
                            }

                            showResults(results.length > 0);
                            log(results.length > 0 ? 'results shown' : 'no results');
                        } catch (e) {
                            log(`ERROR: ${String(e)}`);
                            if (e.stack) log(`STACK: ${e.stack}`);
                            showResults(false);
                        }
                    });

                    return GLib.SOURCE_REMOVE;
                });
            });

            resultBox.connect('row-activated', () => {
                const selected = resultBox.get_selected_row();
                if (!selected) return;

                const data = selected._data;
                const locations = getLocations();

                const isDuplicate = locations.some(
                    (loc, i) =>
                        i !== row._index &&
                        loc.latitude != null &&
                        Math.abs(loc.latitude - data.latitude) < 0.001 &&
                        Math.abs(loc.longitude - data.longitude) < 0.001,
                );

                if (isDuplicate) {
                    window.add_toast(
                        new Adw.Toast({
                            title: `${data.name} is already in your locations`,
                            priority: Adw.ToastPriority.HIGH,
                        }),
                    );
                    return;
                }

                ignoreNextChange = true;
                searchEntry.text = data.query;
                showResults(false);

                if (!nameEntry.text.trim()) nameEntry.text = makeAutoLabel(data);

                const idx = row._index;
                if (locations[idx]) {
                    locations[idx].query = data.query;
                    locations[idx].latitude = data.latitude;
                    locations[idx].longitude = data.longitude;
                    locations[idx].country = data.country;
                    locations[idx].country_code = data.country_code;
                    if (!locations[idx].name) locations[idx].name = nameEntry.text;
                    saveLocations(locations);
                }
            });

            nameEntry.connect('changed', () => {
                const locations = getLocations();
                if (locations[row._index]) {
                    locations[row._index].name = nameEntry.text;
                    saveLocations(locations);
                }
            });

            removeBtn.connect('clicked', () => {
                const label = nameEntry.text.trim() || searchEntry.text.trim() || 'this location';
                const dialog = new Adw.AlertDialog({
                    heading: 'Remove location?',
                    body: `Remove "${label}" from your locations?`,
                });
                dialog.add_response('cancel', 'Cancel');
                dialog.add_response('remove', 'Remove');
                dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
                dialog.set_default_response('cancel');
                dialog.connect('response', (d, response) => {
                    if (response !== 'remove') return;
                    const locations = getLocations();
                    locations.splice(row._index, 1);
                    saveLocations(locations);

                    locationGroup.remove(row);
                    this._locationRows.splice(this._locationRows.indexOf(row), 1);
                    reindexRows();
                });
                dialog.present(window);
            });

            locationGroup.add(row);
            this._locationRows.push(row);
        };

        const loadAllLocations = () => {
            const locations = getLocations();
            for (let i = 0; i < locations.length; i++) addLocationRow(locations[i], i);
        };

        addButton.connect('clicked', () => {
            const locations = getLocations();
            if (locations.length >= MAX_LOCATIONS) {
                window.add_toast(
                    new Adw.Toast({
                        title: `Maximum ${MAX_LOCATIONS} locations allowed`,
                        priority: Adw.ToastPriority.HIGH,
                    }),
                );
                return;
            }
            locations.push({ name: '', query: '' });
            saveLocations(locations);
            addLocationRow(locations[locations.length - 1], locations.length - 1);
        });

        page.add(locationGroup);
        loadAllLocations();

        window.add(page);
    }
}
