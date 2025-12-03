import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Download, 
  Upload, 
  Trash2, 
  Users, 
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Plus,
  UserPlus,
  FileText,
  ChevronLeft,
  ChevronRight
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
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'manual'
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  // Calculate pagination
  const totalPages = Math.ceil(contacts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = useMemo(() => {
    return contacts.slice(startIndex, endIndex);
  }, [contacts, startIndex, endIndex]);

  // Reset to first page when contacts change significantly
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [contacts.length, totalPages, currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      // Scroll to top of table
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const [manualForm, setManualForm] = useState({
    name: '',
    countryCode: '+91',
    phone: '',
    email: '',
    address: '',
    city: '',
    ac: '',
    pc: '',
    ps: ''
  });
  const [formErrors, setFormErrors] = useState({});

  // Update parent when contacts change (but only if contacts actually changed)
  const prevContactsRef = useRef(JSON.stringify(contacts));
  useEffect(() => {
    // Only call onUpdate if contacts actually changed (deep comparison for arrays)
    const currentContactsStr = JSON.stringify(contacts);
    if (prevContactsRef.current !== currentContactsStr) {
      prevContactsRef.current = currentContactsStr;
      onUpdate(contacts);
    }
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

  // Validate manual form
  const validateManualForm = () => {
    const errors = {};
    
    if (!manualForm.name || manualForm.name.trim() === '') {
      errors.name = 'Name is required';
    }
    
    if (!manualForm.phone || manualForm.phone.trim() === '') {
      errors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(manualForm.phone.replace(/\D/g, ''))) {
      errors.phone = 'Phone number must be 10 digits';
    }
    
    if (manualForm.email && manualForm.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(manualForm.email)) {
        errors.email = 'Please enter a valid email address';
      }
    }
    
    if (!manualForm.countryCode || manualForm.countryCode.trim() === '') {
      errors.countryCode = 'Country code is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle manual form input change
  const handleManualFormChange = (field, value) => {
    setManualForm(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Add manual contact
  const handleAddManualContact = () => {
    if (!validateManualForm()) {
      showError('Please fix the errors in the form');
      return;
    }

    // Check for duplicate phone number
    const phoneNumber = manualForm.phone.replace(/\D/g, '');
    const existingPhones = contacts.map(c => c.phone?.replace(/\D/g, ''));
    
    if (existingPhones.includes(phoneNumber)) {
      showError('A contact with this phone number already exists');
      return;
    }

    const newContact = {
      name: manualForm.name.trim(),
      countryCode: manualForm.countryCode.trim(),
      phone: phoneNumber,
      email: manualForm.email.trim() || '',
      address: manualForm.address.trim() || '',
      city: manualForm.city.trim() || '',
      ac: manualForm.ac.trim() || '',
      pc: manualForm.pc.trim() || '',
      ps: manualForm.ps.trim() || '',
      addedAt: new Date()
    };

    setContacts(prev => [...prev, newContact]);
    
    // Reset form
    setManualForm({
      name: '',
      countryCode: '+91',
      phone: '',
      email: '',
      address: '',
      city: '',
      ac: '',
      pc: '',
      ps: ''
    });
    setFormErrors({});
    
    showSuccess('Contact added successfully');
  };

  return (
    <div className="space-y-6 p-6">
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-8 h-8 text-blue-600" />
          <div>
            <h3 className="text-xl font-bold text-gray-800">Upload Respondents</h3>
            <p className="text-sm text-gray-600">Add contacts for CATI interviews by uploading an Excel file or adding manually</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
              activeTab === 'upload'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            Upload Excel
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
              activeTab === 'manual'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Add Manually
          </button>
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
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

          {/* Upload Errors */}
          {uploadErrors.length > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 col-span-2">
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
        )}

        {/* Manual Add Tab */}
        {activeTab === 'manual' && (
          <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <UserPlus className="w-6 h-6 text-blue-600" />
              <h4 className="font-semibold text-gray-800">Add Contact Manually</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(e) => handleManualFormChange('name', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter full name"
                />
                {formErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                )}
              </div>

              {/* Country Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.countryCode}
                  onChange={(e) => handleManualFormChange('countryCode', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.countryCode ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="+91"
                />
                {formErrors.countryCode && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.countryCode}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.phone}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                    handleManualFormChange('phone', value);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.phone ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="10 digit phone number"
                  maxLength={10}
                />
                {formErrors.phone && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="email"
                  value={manualForm.email}
                  onChange={(e) => handleManualFormChange('email', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="email@example.com"
                />
                {formErrors.email && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
                )}
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={manualForm.address}
                  onChange={(e) => handleManualFormChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Street address"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={manualForm.city}
                  onChange={(e) => handleManualFormChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="City name"
                />
              </div>

              {/* AC (Assembly Constituency) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  AC (Assembly Constituency) <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={manualForm.ac}
                  onChange={(e) => handleManualFormChange('ac', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Assembly Constituency"
                />
              </div>

              {/* PC (Parliamentary Constituency) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PC (Parliamentary Constituency) <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={manualForm.pc}
                  onChange={(e) => handleManualFormChange('pc', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Parliamentary Constituency"
                />
              </div>

              {/* PS (Polling Station) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PS (Polling Station) <span className="text-gray-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={manualForm.ps}
                  onChange={(e) => handleManualFormChange('ps', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Polling Station"
                />
              </div>
            </div>

            {/* Add Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleAddManualContact}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Contact
              </button>
            </div>
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
          <>
            {/* Pagination Controls - Top */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  Showing {startIndex + 1} to {Math.min(endIndex, contacts.length)} of {contacts.length} contacts
                </span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={200}>200 per page</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600 px-3">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Contacts Table */}
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
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
                  {paginatedContacts.map((contact, index) => {
                    const actualIndex = startIndex + index;
                    return (
                      <tr key={actualIndex} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-500">{actualIndex + 1}</td>
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
                            onClick={() => handleDeleteContact(actualIndex)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - Bottom */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, contacts.length)} of {contacts.length} contacts
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    First
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 px-3">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RespondentUpload;

