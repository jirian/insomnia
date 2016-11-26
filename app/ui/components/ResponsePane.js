import React, {PropTypes, Component} from 'react';
import fs from 'fs';
import mime from 'mime-types';
import {remote} from 'electron';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import SizeTag from './tags/SizeTag';
import StatusTag from './tags/StatusTag';
import TimeTag from './tags/TimeTag';
import PreviewModeDropdown from './dropdowns/PreviewModeDropdown';
import ResponseViewer from './viewers/ResponseViewer';
import ResponseHeadersViewer from './viewers/ResponseHeadersViewer';
import ResponseCookiesViewer from './viewers/ResponseCookiesViewer';
import * as models from '../../models';
import {REQUEST_TIME_TO_SHOW_COUNTER, MOD_SYM, PREVIEW_MODE_SOURCE, getPreviewModeName} from '../../common/constants';
import {getSetCookieHeaders} from '../../common/misc';
import {cancelCurrentRequest} from '../../common/network';
import {trackEvent} from '../../analytics';

class ResponsePane extends Component {
  state = {response: null};

  async _getResponse (request) {
    if (!request) {
      this.setState({response: null});
    } else {
      const response = await models.response.getLatestByParentId(request._id);
      this.setState({response});
    }
  }

  async _handleDownloadResponseBody () {
    if (!this.state.response) {
      // Should never happen
      console.warn('No response to download');
      return;
    }

    const {body, encoding, contentType} = this.state.response;
    const bodyBuffer = new Buffer(body, encoding);
    const extension = mime.extension(contentType) || '';

    const options = {
      title: 'Save Response',
      buttonLabel: 'Save',
      filters: [{
        name: 'Download', extensions: [extension],
      }]
    };

    remote.dialog.showSaveDialog(options, filename => {
      if (!filename) {
        trackEvent('Response', 'Save Cancel');
        return;
      }

      fs.writeFile(filename, bodyBuffer, {}, err => {
        if (err) {
          console.warn('Failed to save response body', err);
          trackEvent('Response', 'Save Failure');
        } else {
          trackEvent('Response', 'Save Success');

        }
      });
    });
  }

  componentWillReceiveProps (nextProps) {
    this._getResponse(nextProps.request);
  }

  componentDidMount () {
    this._getResponse(this.props.request);
  }

  render () {
    const {
      request,
      previewMode,
      handleSetPreviewMode,
      handleSetFilter,
      loadStartTime,
      editorLineWrapping,
      editorFontSize,
      filter,
      showCookiesModal
    } = this.props;

    const {response} = this.state;

    let timer = null;

    if (loadStartTime >= 0) {
      // Set a timer to update the UI again soon
      // TODO: Move this into a child component so we don't rerender too much
      setTimeout(() => {
        this.forceUpdate();
      }, 100);

      // NOTE: subtract 200ms because the request has some time on either end
      const millis = Date.now() - loadStartTime - 200;
      const elapsedTime = Math.round(millis / 100) / 10;

      timer = (
        <div className="response-pane__overlay">
          {elapsedTime > REQUEST_TIME_TO_SHOW_COUNTER ? (
            <h2>{elapsedTime} seconds...</h2>
          ) : (
            <h2>Loading...</h2>
          )}

          <br/>
          <i className="fa fa-refresh fa-spin"></i>

          <br/>
          <div className="pad">
            <button className="btn btn--clicky"
                    onClick={() => cancelCurrentRequest()}>
              Cancel Request
            </button>
          </div>
        </div>
      )
    }

    if (!request) {
      return (
        <section className="response-pane pane">
          <header className="pane__header"></header>
          <div className="pane__body pane__body--placeholder"></div>
        </section>
      )
    }

    if (!response) {
      return (
        <section className="response-pane pane">
          {timer}

          <header className="pane__header"></header>
          <div className="pane__body pane__body--placeholder">
            <div>
              <table>
                <tbody>
                <tr>
                  <td>Send Request</td>
                  <td className="text-right">
                    <code>{MOD_SYM}Enter</code>
                  </td>
                </tr>
                <tr>
                  <td>Focus Url Bar</td>
                  <td className="text-right">
                    <code>{MOD_SYM}L</code>
                  </td>
                </tr>
                <tr>
                  <td>Manage Cookies</td>
                  <td className="text-right">
                    <code>{MOD_SYM}K</code>
                  </td>
                </tr>
                <tr>
                  <td>Edit Environments</td>
                  <td className="text-right">
                    <code>{MOD_SYM}E</code>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )
    }

    const cookieHeaders = getSetCookieHeaders(response.headers);

    return (
      <section className="response-pane pane">
        {timer}
        {!response ? null : (
          <header className="pane__header">
            <StatusTag
              statusCode={response.statusCode}
              statusMessage={response.statusMessage}
            />
            <TimeTag milliseconds={response.elapsedTime}/>
            <SizeTag bytes={response.bytesRead}/>
          </header>
        )}
        <Tabs className="pane__body">
          <TabList>
            <Tab onClick={() => trackEvent('Response Pane', 'View', 'Response')}>
              <button>
                {getPreviewModeName(previewMode)}
              </button>
              <PreviewModeDropdown
                download={this._handleDownloadResponseBody.bind(this)}
                previewMode={previewMode}
                updatePreviewMode={handleSetPreviewMode}
              />
            </Tab>
            <Tab onClick={() => trackEvent('Response Pane', 'View', 'Cookies')}>
              <button>
                Cookies {cookieHeaders.length ? (
                <span className="txt-sm">
                    ({cookieHeaders.length})
                  </span>
              ) : null}
              </button>
            </Tab>
            <Tab onClick={() => trackEvent('Response Pane', 'View', 'Headers')}>
              <button>
                Headers {response.headers.length ? (
                <span className="txt-sm">
                  ({response.headers.length})
                </span>
              ) : null}
              </button>
            </Tab>
          </TabList>
          <TabPanel>
            <ResponseViewer
              key={response._id}
              bytes={response.bytesRead}
              contentType={response.contentType || ''}
              previewMode={response.error ? PREVIEW_MODE_SOURCE : previewMode}
              filter={filter}
              updateFilter={response.error ? null : handleSetFilter}
              body={response.error ? response.error : response.body}
              encoding={response.encoding}
              error={!!response.error}
              responseId={response._id}
              editorLineWrapping={editorLineWrapping}
              editorFontSize={editorFontSize}
              url={response.url}
            />
          </TabPanel>
          <TabPanel className="scrollable-container">
            <div className="scrollable pad">
              <ResponseCookiesViewer
                showCookiesModal={showCookiesModal}
                key={response._id}
                headers={cookieHeaders}
              />
            </div>
          </TabPanel>
          <TabPanel className="scrollable-container">
            <div className="scrollable pad">
              <ResponseHeadersViewer
                key={response._id}
                headers={response.headers}
              />
            </div>
          </TabPanel>
        </Tabs>
      </section>
    )
  }
}

ResponsePane.propTypes = {
  // Functions
  handleSetFilter: PropTypes.func.isRequired,
  showCookiesModal: PropTypes.func.isRequired,
  handleSetPreviewMode: PropTypes.func.isRequired,

  // Required
  previewMode: PropTypes.string.isRequired,
  filter: PropTypes.string.isRequired,
  editorFontSize: PropTypes.number.isRequired,
  editorLineWrapping: PropTypes.bool.isRequired,
  loadStartTime: PropTypes.number.isRequired,

  // Other
  request: PropTypes.object,
};

export default ResponsePane;
