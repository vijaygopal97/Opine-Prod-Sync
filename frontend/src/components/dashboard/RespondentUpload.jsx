import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Upload, 
  Trash2, 
  Users, 
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Plus
} from 'lucide-react';
import { surveyAPI } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const RespondentUpload = ({ onUpdate, initialData }) => {
  const { showSuccess, showError } = useToast();
  const [contacts, setContacts] = useState(initialData || []);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Update parent when contacts change
  useEffect(() => {
    onUpdate(contacts);
  }, [contacts, onUpdate]);

  // Initialize from initialData only once when component mounts
  // After that, we preserve all contacts (including uploaded ones) and only append new ones
  useEffect(() => {
    // Only initialize on first mount if we have initialData and haven't initialized yet
    if (!isInitialized && initialData && Array.isArray(initialData) && initialData.length > 0) {
      setContacts(initialData);
      setIsInitialized(true);
    } else if (!isInitialized) {
      // Mark as initialized even if no initialData, to prevent future resets
      setIsInitialized(true);
    }
    // Note: We don't update contacts when initialData changes after initialization
    // This ensures uploaded contacts are never lost
  }, [initialData, isInitialized]);

  const handleDownloadTemplate = async () => {
    try {
      await surveyAPI.downloadRespondentTemplate();
      showSuccess('Template downloaded successfully');
    } catch (error) {
      console.error('Error downloading template:', error);
      showError('Failed to download template');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ];
      if (!validTypes.includes(file.type)) {
        showError('Please upload a valid Excel file (.xlsx or .xls)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setUploadErrors([]);

    try {
      const response = await surveyAPI.uploadRespondentContacts(selectedFile);
      
      if (response.success && response.data.contacts) {
        // Merge new contacts with existing ones - always append, never replace
        const newContacts = response.data.contacts.map(contact => ({
          ...contact,
          addedAt: new Date(contact.addedAt || new Date())
        }));
        
        // Combine existing and new contacts, avoiding duplicates based on phone number
        // This ensures we always append to the existing list
        setContacts(prevContacts => {
          const existingPhones = new Set(prevContacts.map(c => c.phone));
          const uniqueNewContacts = newContacts.filter(c => !existingPhones.has(c.phone));
          const updatedContacts = [...prevContacts, ...uniqueNewContacts];
          
          console.log('📝 Contacts before upload:', prevContacts.length);
          console.log('📝 New contacts from file:', newContacts.length);
          console.log('📝 Unique new contacts (after duplicate check):', uniqueNewContacts.length);
          console.log('📝 Total contacts after upload:', updatedContacts.length);
          
          return updatedContacts;
        });
        
        setSelectedFile(null);
        
        // Reset file input
        const fileInput = document.getElementById('excel-upload');
        if (fileInput) fileInput.value = '';

        // Calculate how many were actually added (excluding duplicates)
        const existingPhones = new Set(contacts.map(c => c.phone));
        const actuallyAdded = newContacts.filter(c => !existingPhones.has(c.phone)).length;
        const duplicatesSkipped = newContacts.length - actuallyAdded;

        if (response.data.errors && response.data.errors.length > 0) {
          setUploadErrors(response.data.errors);
          let message = `Successfully added ${actuallyAdded} contact(s)`;
          if (duplicatesSkipped > 0) {
            message += ` (${duplicatesSkipped} duplicate(s) skipped)`;
          }
          message += `. ${response.data.errors.length} row(s) had errors.`;
          showError(message);
        } else {
          let message = `Successfully added ${actuallyAdded} contact(s)`;
          if (duplicatesSkipped > 0) {
            message += ` (${duplicatesSkipped} duplicate(s) skipped)`;
          }
          showSuccess(message);
        }
      } else {
        showError(response.message || 'Failed to upload contacts');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      const errorMessage = error.response?.data?.message || 'Failed to upload file. Please check the file format.';
      showError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteContact = (index) => {
    const updatedContacts = contacts.filter((_, i) => i !== index);
    setContacts(updatedContacts);
    showSuccess('Contact removed successfully');
  };

  const handleDeleteAll = () => {
    if (window.confirm('Are you sure you want to delete all contacts?')) {
      setContacts([]);
      showSuccess('All contacts removed');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-8 h-8 text-blue-600" />
          <div>
            <h3 className="text-xl font-bold text-gray-800">Upload Respondents</h3>
            <p className="text-sm text-gray-600">Add contacts for CATI interviews by uploading an Excel file</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Download Template */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
              <h4 className="font-semibold text-gray-800">Download Template</h4>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Download the Excel template with the required columns (Name, Country Code, Phone, Email, Address, City, AC, PC, PS)
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>

          {/* Upload File */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <Upload className="w-6 h-6 text-blue-600" />
              <h4 className="font-semibold text-gray-800">Upload Contacts</h4>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Upload an Excel file with respondent contact information
            </p>
            <div className="space-y-3">
              <input
                id="excel-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>{selectedFile.name}</span>
                </div>
              )}
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Contacts
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Upload Errors */}
        {uploadErrors.length > 0 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <h4 className="font-semibold text-yellow-800">Upload Warnings</h4>
            </div>
            <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1 max-h-32 overflow-y-auto">
              {uploadErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Contacts List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">
              Respondent Contacts ({contacts.length})
            </h3>
          </div>
          {contacts.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete All
            </button>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No contacts added yet</p>
            <p className="text-sm text-gray-400 mt-2">Upload an Excel file to add contacts</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Country Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">City</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">AC</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PC</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contacts.map((contact, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-800">{contact.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.countryCode || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{contact.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.email || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.address || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.city || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.ac || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.pc || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.ps || '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteContact(index)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title="Delete contact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RespondentUpload;

